import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import FundingLifecycleWorkspace, { FundingRecordEditor } from './FundingLifecycleWorkspace';
import { api } from '../lib/api';

let mockRole = 'org_admin';
jest.mock('../features/AuthContext', () => ({ useAuth: () => ({ user: { role: mockRole } }) }));
jest.mock('../lib/api', () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const record = { id: 'test-grant', title: 'Council entered grant', funder: 'Council funder', status: 'identified', currencyCode: 'NZD', requestedAmount: '0.00', awardedAmount: null, dueDate: '2027-01-01', acquittalDueDate: null, version: 1, updatedAt: '2026-11-03T00:00:00.000Z', provenance: 'council_entered', allowedTransitions: ['assessing', 'withdrawn'], evidenceIds: [], workItemIds: [] };
beforeEach(() => {
  mockRole = 'org_admin'; jest.clearAllMocks(); window.history.replaceState({}, '', '/');
  api.get.mockImplementation((path) => {
    if (path === '/workspace/profile') return Promise.resolve({ data: { data: { profile: { defaultCurrency: 'NZD' } } } });
    if (path === '/funding-lifecycle/options') return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    if (path === '/grants/test-grant/history') return Promise.resolve({ data: { data: [{ id: 'audit', action: 'created', createdAt: '2026-11-03', reason: 'Manual record' }] } });
    if (path === '/grants/test-grant') return Promise.resolve({ data: { data: { ...record, ownerName: 'Council Owner', evidence: [{ id: 'evidence', title: 'Recorded evidence', isVerified: false }], workItems: [{ id: 'work', title: 'Evidence review work', status: 'not_started' }] } } });
    return Promise.resolve({ data: { data: [record], meta: { total: 1 } } });
  });
});
test('executive reads actual detail and evidence/work without create/edit/archive or fictional progress', async () => {
  mockRole = 'executive'; render(<FundingLifecycleWorkspace kind="grant" />);
  await screen.findByText('Council entered grant');
  expect(screen.queryByRole('button', { name: 'Add grant' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open lifecycle' }));
  await screen.findByText('Council Owner'); await screen.findByText(/Recorded evidence/);
  expect(screen.getByText(/Evidence review work/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit grant' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Archive record' })).toBeNull();
  expect(screen.queryByText(/Application and evidence progress/)).toBeNull();
  expect(screen.queryByText(/\d+%/)).toBeNull();
  expect(api.get).toHaveBeenCalledWith('/grants/test-grant/history');
});
test('API error shows actionable unavailable state and never falls back to samples or enables writes', async () => {
  api.get.mockRejectedValue({ response: { data: { error: 'Funding API unavailable' } } });
  render(<FundingLifecycleWorkspace kind="pathway" />);
  const alert = await screen.findByRole('alert'); expect(alert.textContent).toContain('Funding API unavailable');
  expect(screen.queryByText('Regional housing partnership program')).toBeNull();
  expect(screen.getByRole('button', { name: 'Add funding pathway' }).disabled).toBe(true);
});
test('editor uses declared currency, $ prefix, allowed transitions and audited versioned decimal payload', async () => {
  api.patch.mockResolvedValue({ data: { data: record } }); const saved = jest.fn();
  render(<FundingRecordEditor kind="grant" record={record} currencyCode="NZD" onCancel={jest.fn()} onSaved={saved} />);
  const amount = screen.getByLabelText('Requested amount (NZD)'); expect(amount.value).toBe('0.00');
  expect(amount.parentElement.textContent).toContain('$');
  const stages = within(screen.getByLabelText('Lifecycle stage')).getAllByRole('option').map((option) => option.value);
  expect(stages).toEqual(['identified', 'assessing', 'withdrawn']);
  fireEvent.change(amount, { target: { value: '10.10' } });
  fireEvent.change(screen.getByLabelText('Audit reason'), { target: { value: 'Council amount updated' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save audited record' }));
  await waitFor(() => expect(saved).toHaveBeenCalled());
  expect(api.patch).toHaveBeenCalledWith('/grants/test-grant', expect.objectContaining({ requestedAmount: '10.10', currencyCode: 'NZD', reason: 'Council amount updated', version: 1, updatedAt: record.updatedAt }));
});
test('conflicting edit retains entered values and gives an actionable reload instruction', async () => {
  api.patch.mockRejectedValue({ response: { data: { code: 'funding_edit_conflict' } } });
  render(<FundingRecordEditor kind="grant" record={record} currencyCode="NZD" onCancel={jest.fn()} onSaved={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Audit reason'), { target: { value: 'Keep my notes' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save audited record' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Your edits were not saved');
  expect(screen.getByLabelText('Audit reason').value).toBe('Keep my notes');
});
test('archiving sends current revision/timestamp and reason and returns a preserved-stage archived detail', async () => {
  const archived = { ...record, archivedAt: '2026-11-03T00:00:00.000Z', version: 2 };
  api.post.mockResolvedValue({ data: { data: archived } });
  render(<FundingLifecycleWorkspace kind="grant" />);
  await screen.findByText('Council entered grant'); fireEvent.click(screen.getByRole('button', { name: 'Open lifecycle' }));
  await screen.findByText('Council Owner');
  fireEvent.change(screen.getByLabelText('Archive audit reason'), { target: { value: 'Council no longer pursuing' } });
  fireEvent.click(screen.getByRole('button', { name: 'Archive record' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/grants/test-grant/archive', { version: 1, updatedAt: record.updatedAt, reason: 'Council no longer pursuing' }));
});
