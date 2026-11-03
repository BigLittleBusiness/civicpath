import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TenantDataPanel } from './TenantDataPanel';
import { TenantLifecycleAdminPanel } from './TenantLifecycleAdminPanel';

jest.mock('./PrivilegedActionModal', () => ({ PrivilegedActionModal: ({ action }) => action ? <div role="dialog">Fresh security check: {action.label}</div> : null }));
const status = { policy: { configured: false, backups: 'Preserve backups', objectVersions: 'Preserve versions' }, holdActive: false,
  capabilities: { canExport: true, canRequest: true }, limits: { maxRows: 20000, maxBytes: 8388608 }, requests: [], exports: [], attachmentRequests: [] };
const clientFor = (data = status) => ({ get: jest.fn().mockResolvedValue({ data: { data } }), post: jest.fn().mockResolvedValue({ data: { data: { id: 'test-export' } } }) });
it('renders bounded export, empty state and disabled erasure honestly', async () => {
  render(<TenantDataPanel client={clientFor()}/>);
  await screen.findByText(/No recent exports/);
  expect(screen.getByText(/Retention schedule and data erasure are disabled/)).toBeTruthy();
  expect(screen.getByRole('button', { name: /Prepare complete workspace export/ })).toBeTruthy();
  expect(screen.getByLabelText(/Reason/)).toBeTruthy();
});
it('prepares an export via the authenticated API and announces readiness', async () => {
  const client = clientFor(); render(<TenantDataPanel client={client}/>);
  fireEvent.click(await screen.findByRole('button', { name: /Prepare complete workspace export/ }));
  await waitFor(() => expect(client.post).toHaveBeenCalledWith('/tenant-lifecycle/exports', {}, { timeout: 30000 }));
  expect(await screen.findByRole('status')).toHaveProperty('textContent', expect.stringContaining('ready'));
});
it('submits legal hold via the controlled request operation', async () => {
  const client = clientFor(); render(<TenantDataPanel client={client}/>);
  fireEvent.change(await screen.findByLabelText('Request type'), { target: { value: 'legal_hold' } });
  fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'Preserve records for proceedings.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit for platform review' }));
  await waitFor(() => expect(client.post).toHaveBeenCalledWith('/tenant-lifecycle/requests', { kind: 'legal_hold', reason: 'Preserve records for proceedings.' }));
});
it('executive is read-only and suspended/failed controls provide actionable retry', async () => {
  const { unmount } = render(<TenantDataPanel role="executive" client={clientFor({ ...status, capabilities: { canExport: false, canRequest: false } })}/>);
  await screen.findByText(/Executive access is read-only/); expect(screen.queryByRole('button', { name: /Prepare complete/ })).toBeNull(); unmount();
  const client = clientFor(); client.get.mockRejectedValue({ response: { data: { error: 'tenant suspended' } } });
  render(<TenantDataPanel client={client}/>); expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'tenant suspended'); expect(screen.getByRole('button', { name: /Refresh/ })).toBeTruthy();
});
it('hold blocks closure UI and forbids contributor UI controls', async () => {
  const { unmount } = render(<TenantDataPanel client={clientFor({ ...status, holdActive: true })}/>);
  expect(await screen.findByRole('button', { name: /Closure blocked/ })).toHaveProperty('disabled', true); unmount();
  render(<TenantDataPanel role="contributor" client={clientFor()}/>); expect(screen.queryByRole('button')).toBeNull();
});
it('platform review requires fresh security verification before it posts', async () => {
  const client = clientFor({ ...status, organization: { name: 'Test Council' }, requests: [{ id: 'request-1', kind: 'closure', status: 'pending', reason: 'End access while preserving records.' }] });
  render(<TenantLifecycleAdminPanel organizationId="tenant-1" client={client}/>);
  fireEvent.change(await screen.findByLabelText('Pending request'), { target: { value: 'request-1' } });
  fireEvent.change(screen.getByLabelText('Review rationale'), { target: { value: 'Review verified with Council.' } });
  fireEvent.click(screen.getByRole('button', { name: /Verify security/ }));
  expect(await screen.findByRole('dialog')).toHaveProperty('textContent', expect.stringContaining('Fresh security check'));
  expect(client.post).not.toHaveBeenCalled();
});
