import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { api } from '../lib/api';
import { ProjectMaintenancePanel } from './ProjectMaintenancePanel';
import { StrategyMaintenancePanel } from './StrategyMaintenancePanel';
import { MaintenanceRecordEditor, maintenancePayload } from './RecordMaintenanceWorkspace';

jest.mock('../lib/api', () => ({ api: { get: jest.fn(), patch: jest.fn(), post: jest.fn() } }));
const id = '00000000-0000-4000-8000-000000000004';
const updatedAt = '2026-11-01T00:00:00.000Z';
const baseRecord = (kind = 'projects') => ({ id, name: 'Council project', title: 'Council action', updatedAt, status: 'not_started', maintenance: { kind, version: 2, archivedAt: null, canArchive: true, canRestore: false, editableFields: ['name'], fields: { name: { type: 'text', max: 200, nullable: false } } } });
beforeEach(() => jest.clearAllMocks());

test('panels default to disabled and never mutate or load sample/fallback records', () => {
  const { rerender } = render(<ProjectMaintenancePanel project={{ id }} canManage team={[]} />);
  expect(screen.getByText(/disabled until/)).toBeTruthy(); expect(api.get).not.toHaveBeenCalled();
  rerender(<ProjectMaintenancePanel project={{ id: 'sample-1' }} enabled canManage />);
  expect(screen.getByText(/not a sample/)).toBeTruthy(); expect(api.get).not.toHaveBeenCalled();
  rerender(<StrategyMaintenancePanel action={{ id: 'sample-2' }} enabled />);
  expect(api.get).not.toHaveBeenCalled();
});

test('edit sends only changed fields with version and updatedAt checks', async () => {
  const record = baseRecord(); const onSaved = jest.fn(); api.patch.mockResolvedValue({ data: { data: { ...record, name: 'Edited project' } } });
  render(<MaintenanceRecordEditor record={record} onSaved={onSaved}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Edit record' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Edited project' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`/maintenance/projects/${id}`, { changes: { name: 'Edited project' }, expectedVersion: 2, expectedUpdatedAt: updatedAt }));
  expect(await screen.findByText('Changes saved.')).toBeTruthy(); expect(onSaved).toHaveBeenCalledTimes(1);
});

test('executive API capabilities override a parent canManage flag and show no writes', async () => {
  const record = { ...baseRecord(), maintenance: { ...baseRecord().maintenance, canArchive: false, editableFields: [], readOnlyReason: 'Executive access is read-only.' } };
  api.get.mockImplementation((path) => Promise.resolve({ data: path.includes(`/projects/${id}`) ? { data: record } : { data: [], pagination: { hasMore: false } } }));
  render(<ProjectMaintenancePanel project={{ id }} canManage enabled />);
  expect(await screen.findByText('Executive access is read-only.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Edit/ })).toBeNull(); expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
});

test('action and milestone completion uses established guarded PATCH paths', async () => {
  for (const kind of ['actions', 'milestones']) {
    const record = { ...baseRecord(kind), maintenance: { ...baseRecord(kind).maintenance, editableFields: ['status'], fields: { status: { type: 'select', options: ['not_started', 'complete'], completeCode: 'complete', nullable: false } } } };
    api.patch.mockResolvedValue({ data: { data: { ...record, status: 'complete' } } });
    const { unmount } = render(<MaintenanceRecordEditor record={record} onSaved={jest.fn()}/>);
    fireEvent.click(screen.getByRole('button', { name: 'Mark complete' }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith(kind === 'actions' ? `/strategy-actions/${id}` : `/strategy-milestones/${id}`, maintenancePayload(record, { status: 'complete' })));
    unmount();
  }
});

test('409 retains draft, announces conflict and requires explicit latest-record reload', async () => {
  const record = baseRecord(); api.patch.mockRejectedValue({ response: { status: 409, data: { error: 'This record changed. Refresh and retry.' } } });
  api.get.mockResolvedValue({ data: { data: { ...record, name: 'Latest' } } });
  const saved = jest.fn(); render(<MaintenanceRecordEditor record={record} onSaved={saved}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Edit record' })); fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Unsaved draft' } }); fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  expect(await screen.findByRole('alert')).toBeTruthy(); expect(screen.getByLabelText('Name').value).toBe('Unsaved draft');
  fireEvent.click(screen.getByRole('button', { name: 'Discard draft and load latest' }));
  await waitFor(() => expect(saved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Latest' })));
});

test('archive requires reason and explicit confirmation and performs no deletion', async () => {
  const record = baseRecord(); api.post.mockResolvedValue({ data: { data: { ...record, maintenance: { ...record.maintenance, archivedAt: updatedAt } } } });
  render(<MaintenanceRecordEditor record={record} onSaved={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Archive' })); expect(api.post).not.toHaveBeenCalled();
  const confirm = screen.getByRole('form', { name: 'archive confirmation' }); fireEvent.change(within(confirm).getByLabelText('Archive reason'), { target: { value: 'Superseded' } }); fireEvent.click(within(confirm).getByRole('button', { name: 'Confirm archive' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/maintenance/projects/${id}/archive`, { expectedVersion: 2, expectedUpdatedAt: updatedAt, reason: 'Superseded' }));
});

test('archived supporting records are hidden until the user enables the archive view', async () => {
  const root = baseRecord(); const child = { ...baseRecord('work-items'), id: '00000000-0000-4000-8000-000000000007', name: 'Archived work', maintenance: { ...baseRecord('work-items').maintenance, archivedAt: updatedAt, editableFields: [], canArchive: false, canRestore: true } };
  api.get.mockImplementation((path) => Promise.resolve({ data: path.includes(`/projects/${id}`) ? { data: root } : { data: path.includes('/work-items') ? [child] : [], pagination: { hasMore: false } } }));
  render(<ProjectMaintenancePanel project={{ id }} enabled />);
  await screen.findByText('Council project'); await waitFor(() => expect(api.get).toHaveBeenCalledTimes(3));
  expect(screen.queryByText('Archived work')).toBeNull(); fireEvent.click(screen.getByLabelText('Show archived supporting records'));
  expect(await screen.findByText('Archived work')).toBeTruthy();
});
