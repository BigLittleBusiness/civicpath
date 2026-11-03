import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ReportsPage from './ReportsPage';
import { api } from '../lib/api';
import { useAuth } from '../features/AuthContext';
jest.mock('../lib/api', () => ({ api: { get: jest.fn() } }));
jest.mock('../features/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../components/ReportHistoryPanel', () => ({ ReportHistoryPanel: ({ strategyId, periodId }) => <section aria-label="Selected report">{`${strategyId}/${periodId}`}</section> }));
const result = (data) => ({ data: { data, pagination: { hasMore: false, limit: 50, offset: 0 } } });
beforeEach(() => { api.get.mockReset(); useAuth.mockReturnValue({ user: { role: 'executive', organizationId: 'org1' } }); });
test('chooses a real active strategy and its real open period, changes selection via API', async () => {
  api.get.mockImplementation((path) => Promise.resolve(path === '/reports/strategies' ? result([{ id: 'draft', name: 'Draft', status: 'draft' }, { id: 'active', name: 'Real active strategy', status: 'active' }]) : result([{ id: 'locked', label: 'Older locked', status: 'locked' }, { id: 'open', label: 'Real current period', status: 'open' }])));
  render(<ReportsPage/>); await waitFor(() => expect(screen.getByRole('region', { name: 'Selected report' }).textContent).toBe('active/open'));
  expect(screen.getByLabelText('Strategy').value).toBe('active'); expect(screen.getByLabelText('Reporting period').value).toBe('open');
  fireEvent.change(screen.getByLabelText('Reporting period'), { target: { value: 'locked' } }); expect(screen.getByRole('region', { name: 'Selected report' }).textContent).toBe('active/locked');
  expect(screen.queryByText('72%')).toBeNull(); expect(screen.queryByText('Funding confidence')).toBeNull(); expect(api.get).toHaveBeenCalledWith('/reports/strategies/active/periods', expect.objectContaining({ params: { limit: 50 } }));
});
test('empty and unavailable API are clearly labelled without fallback data', async () => {
  api.get.mockResolvedValue(result([])); const { unmount } = render(<ReportsPage/>); await screen.findByText(/No strategy has been recorded/); unmount();
  api.get.mockRejectedValue({ response: { status: 404 } }); render(<ReportsPage/>); await screen.findByRole('alert'); expect(screen.getByText(/complete reporting integration/)).toBeTruthy(); expect(screen.getByRole('button', { name: 'Retry selections' })).toBeTruthy();
});
test('contributors cannot load read-only executive reporting endpoints', () => {
  useAuth.mockReturnValue({ user: { role: 'contributor' } }); render(<ReportsPage/>); expect(screen.getByText(/Reports are available to/)).toBeTruthy(); expect(api.get).not.toHaveBeenCalled();
});
