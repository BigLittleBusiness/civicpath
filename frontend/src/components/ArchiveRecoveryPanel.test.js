import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { ArchiveRecoveryPanel } from './ArchiveRecoveryPanel';
const id = '11111111-1111-4111-8111-111111111111';
const stamp = '2026-11-03T00:00:00.000Z';
const record = { id, name: 'Retained Council project', updatedAt: stamp, status: 'business_case', maintenance: { kind: 'projects', version: 3, archivedAt: stamp, canRestore: true, archiveReason: 'Superseded' } };
const page = (rows, more = false) => ({ data: { data: rows, pagination: { hasMore: more, nextOffset: 25 } } });
const clientFor = (role = 'org_admin') => ({ get: jest.fn().mockImplementation((path) => Promise.resolve(path.endsWith(id) ? { data: { data: { ...record, maintenance: { ...record.maintenance, canRestore: ['org_admin', 'portfolio_manager'].includes(role) } } } } : page([record]))), post: jest.fn().mockResolvedValue({ data: { data: { ...record, maintenance: { ...record.maintenance, version: 4, archivedAt: null, canRestore: false } } } }) });
afterEach(cleanup);
test('empty filtered page still loads later archived records using server pagination', async () => {
  const client = { get: jest.fn().mockResolvedValueOnce(page([], true)).mockResolvedValueOnce(page([record])), post: jest.fn() };
  render(<ArchiveRecoveryPanel role="org_admin" client={client}/>);
  fireEvent.click(await screen.findByRole('button', { name: 'Load more archive pages' }));
  await screen.findByText(record.name);
  expect(client.get).toHaveBeenLastCalledWith('/maintenance/projects', { params: { archived: 'true', limit: 25, offset: 25 } });
});
test('restores disappeared root using inspected form-lifetime snapshot and explicit confirmation', async () => {
  const client = clientFor(); const restored = jest.fn(); render(<ArchiveRecoveryPanel role="org_admin" client={client} onRestored={restored}/>);
  fireEvent.click(await screen.findByRole('button', { name: `Inspect ${record.name}` }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore retained record' }));
  expect(client.post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
  await waitFor(() => expect(client.post).toHaveBeenCalledWith(`/maintenance/projects/${id}/restore`, { expectedUpdatedAt: stamp, expectedVersion: 3 }));
  await screen.findByText(/Record restored without deletion/); expect(restored).toHaveBeenCalledTimes(1);
  expect(client.get.mock.calls.filter(([path]) => path.endsWith(id))).toHaveLength(1);
});
test.each(['org_admin', 'portfolio_manager', 'contributor', 'executive', 'platform_admin', 'unknown'])('%s respects council reads and manager-only restore controls', async (role) => {
  const client = clientFor(role); render(<ArchiveRecoveryPanel role={role} client={client}/>);
  const reader = !['platform_admin', 'unknown'].includes(role);
  expect(client.get.mock.calls.length > 0).toBe(reader);
  if (!reader) return;
  fireEvent.click(await screen.findByRole('button', { name: `Inspect ${record.name}` }));
  await screen.findByRole('region', { name: 'Archived record detail' });
  expect(!!screen.queryByRole('button', { name: 'Restore retained record' })).toBe(['org_admin', 'portfolio_manager'].includes(role));
  expect(client.post).not.toHaveBeenCalled();
});
test('409 retains inspected revision, blocks replay and requires explicit reload before fresh confirmation', async () => {
  const client = clientFor(); client.post.mockRejectedValue({ response: { status: 409, data: { error: 'Record changed.' } } });
  render(<ArchiveRecoveryPanel role="org_admin" client={client}/>);
  fireEvent.click(await screen.findByRole('button', { name: `Inspect ${record.name}` }));
  fireEvent.click(await screen.findByRole('button', { name: 'Restore retained record' })); fireEvent.click(screen.getByRole('button', { name: 'Confirm restore' }));
  await screen.findByRole('alert'); expect(screen.getByRole('button', { name: 'Confirm restore' }).disabled).toBe(true);
  expect(screen.getByText(/Revision 3/)).toBeTruthy(); expect(client.post).toHaveBeenCalledTimes(1);
  client.get.mockResolvedValue({ data: { data: { ...record, maintenance: { ...record.maintenance, version: 4 } } } });
  fireEvent.click(screen.getByRole('button', { name: 'Load latest record and compare' }));
  await screen.findByText(/Revision 4/); expect(screen.queryByRole('button', { name: 'Confirm restore' })).toBeNull();
});
test('stale archive responses cannot fill the next record type', async () => {
  let complete; const client = { get: jest.fn().mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; })).mockResolvedValue(page([])) };
  const { unmount } = render(<ArchiveRecoveryPanel role="org_admin" client={client}/>); unmount();
  render(<ArchiveRecoveryPanel role="org_admin" initialKind="actions" client={client}/>);
  await screen.findByText(/No archived records/); complete(page([record]));
  await waitFor(() => expect(screen.queryByText(record.name)).toBeNull());
});
