import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import StrategyDeliveryPage from './StrategyDeliveryPage';
import { api } from '../lib/api';
import { useAuth } from '../features/AuthContext';
jest.mock('../lib/api', () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock('../features/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-router-dom', () => ({ useLocation: () => ({ search: '?actionId=22222222-2222-4222-8222-222222222222' }) }));
jest.mock('../components/CollaborationPanel', () => ({ CollaborationPanel: () => null }));
jest.mock('../components/RoleHelpPanel', () => ({ ContextualHelpLink: () => null }));
jest.mock('../components/StrategyMaintenancePanel', () => ({ StrategyMaintenancePanel: ({ enabled, action }) => <p>Maintenance {enabled ? 'enabled' : 'disabled'} {action.id}</p> }));
jest.mock('../components/ReviewWorkflowPanel', () => ({ ReviewWorkflowPanel: ({ reportingPeriods, statuses, action }) => <p>Review {action.id} {reportingPeriods.length} periods {statuses.length} statuses</p> }));
jest.mock('../components/ReportHistoryPanel', () => ({ ReportHistoryPanel: ({ periodId }) => <p>Safe report {periodId}</p> }));
jest.mock('../components/ArchiveRecoveryPanel', () => ({ ArchiveRecoveryPanel: () => <p>Archive recovery independent of selection</p> }));
const strategy = '11111111-1111-4111-8111-111111111111'; const action = '22222222-2222-4222-8222-222222222222'; const period = '33333333-3333-4333-8333-333333333333'; const older = '44444444-4444-4444-8444-444444444444';
let detail;
beforeEach(() => {
  jest.clearAllMocks(); useAuth.mockReturnValue({ user: { id: 'manager', role: 'org_admin' } });
  detail = { id: action, strategyId: strategy, title: 'Recorded Council action', status: 'not_started', ownerId: 'manager', dependencies: [] };
  const workspace = { selectedStrategy: { id: strategy, name: 'Adopted Council strategy' }, strategies: [{ id: strategy, name: 'Adopted Council strategy' }], actions: [detail], statuses: [{ code: 'not_started', label: 'Not started', category: 'not_started' }], focusAreas: [], teamMembers: [], reportingPeriods: [{ id: period, label: 'Current period', status: 'open' }, { id: older, label: 'Recorded prior period', status: 'closed' }] };
  api.get.mockImplementation((path) => Promise.resolve({ data: { data: path === '/strategy-workspace' ? workspace : path === '/projects' ? [] : detail } }));
  api.post.mockResolvedValue({ data: {} });
});
test('real selected action receives enabled maintenance, periods/statuses review and independent recovery', async () => {
  render(<StrategyDeliveryPage/>); await screen.findByText(`Maintenance enabled ${action}`);
  expect(screen.getByText(`Review ${action} 2 periods 1 statuses`)).toBeTruthy();
  expect(screen.getByText('Archive recovery independent of selection')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Quarterly report' }));
  fireEvent.change(screen.getByLabelText('Report period'), { target: { value: older } });
  expect(screen.getByText(`Safe report ${older}`)).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Save report snapshot' })).toBeNull();
});
test.each(['contributor', 'executive'])('%s does not receive manager creation controls', async (role) => {
  useAuth.mockReturnValue({ user: { id: 'viewer', role } }); render(<StrategyDeliveryPage/>); await screen.findByText(`Maintenance enabled ${action}`);
  expect(screen.queryByRole('button', { name: 'Add action' })).toBeNull(); expect(screen.queryByRole('button', { name: 'Add milestone' })).toBeNull();
  expect(screen.getByRole('button', { name: /Quarterly update/ }).disabled).toBe(true);
});
test('platform does not request Council strategy APIs', () => {
  useAuth.mockReturnValue({ user: { role: 'platform_admin', operationsOnly: true, accessActive: false } }); render(<StrategyDeliveryPage/>); expect(api.get).not.toHaveBeenCalled();
});
test.each([0, 7])('quarterly modal posts retained strict version %i and preserves original draft on 409', async (version) => {
  if (version) detail.QuarterlyActionUpdates = [{ id: older, reportingPeriodId: period, version, achievements: 'Original narrative' }];
  api.post.mockRejectedValue({ response: { status: 409, data: { error: 'Changed elsewhere' } } });
  render(<StrategyDeliveryPage/>); await screen.findByText(`Maintenance enabled ${action}`);
  fireEvent.click(screen.getByRole('button', { name: /Quarterly update/ }));
  const modal = screen.getByRole('dialog', { name: 'Capture quarterly action update' });
  fireEvent.change(within(modal).getByLabelText('Achievements and progress'), { target: { value: 'Officer draft retained' } });
  fireEvent.click(within(modal).getByRole('button', { name: 'Save quarterly update' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/strategy-reporting-periods/${period}/action-updates`, expect.objectContaining({ actionId: action, expectedVersion: version, achievements: 'Officer draft retained' })));
  await within(modal).findByRole('alert'); expect(within(modal).getByLabelText('Achievements and progress').value).toBe('Officer draft retained');
  expect(within(modal).getByRole('button', { name: 'Saving…' }).disabled).toBe(true);
  expect(api.post).toHaveBeenCalledTimes(1);
});
