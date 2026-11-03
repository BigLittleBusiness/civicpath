import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MaintenanceRecordEditor } from './RecordMaintenanceWorkspace';
import { api } from '../lib/api';
jest.mock('../lib/api', () => ({ api: { get: jest.fn(), patch: jest.fn() } }));
test('dirty maintenance form retains opening timestamp and revision across parent refresh', async () => {
  const id = '11111111-1111-4111-8111-111111111111'; const stamp = '2026-11-01T00:00:00.000Z';
  const original = { id, name: 'Council project', updatedAt: stamp, maintenance: { kind: 'projects', version: 2, archivedAt: null, canArchive: false, canRestore: false, editableFields: ['name'], fields: { name: { type: 'text', max: 200, nullable: false } } } };
  api.patch.mockResolvedValue({ data: { data: original } }); const saved = jest.fn();
  const { rerender } = render(<MaintenanceRecordEditor record={original} onSaved={saved}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Edit record' }));
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Officer retained draft' } });
  rerender(<MaintenanceRecordEditor record={{ ...original, name: 'Competing edit', updatedAt: '2026-11-03T01:00:00.000Z', maintenance: { ...original.maintenance, version: 3 } }} onSaved={saved}/>);
  expect(screen.getByLabelText('Name').value).toBe('Officer retained draft');
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`/maintenance/projects/${id}`, { changes: { name: 'Officer retained draft' }, expectedVersion: 2, expectedUpdatedAt: stamp }));
  expect(api.get).not.toHaveBeenCalled();
});
