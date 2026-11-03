import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ReportDocument, ReportHistoryPanel } from './ReportHistoryPanel';
import { useAuth } from '../features/AuthContext';
jest.mock('../features/AuthContext', () => ({ useAuth: jest.fn() }));
const report = { schemaVersion: 1, generatedAt: '2026-10-01T12:00:00Z', strategy: { name: 'Actual strategy' }, reportingPeriod: { label: 'Real Q1', startsOn: '2026-07-01', endsOn: '2026-09-30' }, basis: 'Live register, not period-end reconstruction. No formal approval.', summary: { totalActions: 1, onTrack: 1, attentionRequired: 0, evidenceCoverage: 100, evidenceCoverageDefinition: 'Recorded does not mean verified.', fundingByCurrency: {} }, narrative: 'Recorded officer brief', actions: [{ id: 'a1', actionCode: 'A1', title: 'Actual action', status: 'on_track', recordedEvidenceLinks: 1 }], evidence: [{ id: 'e1', actionId: 'a1', title: 'Recorded document', evidenceType: 'document', recordedAt: '2026-09-15', source: 'Council team', provenance: 'Recorded, not independently verified' }] };
const snapshot = { id: 'snap1', version: 4, status: 'draft', createdAt: '2026-10-01T12:00:00Z', approvalStatus: 'not_certified', assurance: 'No formal review or approval certified.', content: report };
const response = (data, pagination) => ({ data: { data, pagination } });
function client() { return { get: jest.fn((path) => Promise.resolve(path.endsWith('/snapshots') ? response([snapshot], { hasMore: false }) : path.includes('/snapshots/') ? response(snapshot) : response(report))), post: jest.fn(() => Promise.resolve(response({ ...snapshot, id: 'snap2', version: 5 }))) }; }
beforeEach(() => { useAuth.mockReturnValue({ user: { role: 'executive' } }); });

test('renders recorded metrics and provenance with semantic headings and no raw HTML', () => {
  render(<ReportDocument report={{ ...report, narrative: '<script>unsafe()</script>' }} snapshot={snapshot}/>);
  expect(screen.getByRole('heading', { name: 'Actual strategy' })).toBeTruthy(); expect(screen.getByText('Recorded does not mean verified.')).toBeTruthy(); expect(screen.getByText('Council team')).toBeTruthy(); expect(screen.getByText('2026-09-15')).toBeTruthy(); expect(screen.getByText(/Snapshot reference: snap1/)).toBeTruthy(); expect(document.querySelector('script')).toBeNull(); expect(screen.getByText('<script>unsafe()</script>')).toBeTruthy();
});
test('executives see read-only live report and can read historic content with metadata and download controls', async () => {
  const apiClient = client(); render(<ReportHistoryPanel strategyId="s1" periodId="p1" apiClient={apiClient}/>);
  await screen.findByText('Recorded officer brief'); expect(screen.queryByRole('button', { name: /Save recorded draft snapshot/ })).toBeNull(); expect(screen.getByText(/Executive access is read-only/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Version 4/ })); await screen.findByText(/Snapshot reference: snap1/);
  expect(apiClient.get).toHaveBeenCalledWith('/reports/snapshots/snap1'); expect(screen.getByRole('button', { name: 'Download JSON' })).toBeTruthy(); expect(screen.getByRole('button', { name: 'Download CSV' })).toBeTruthy(); expect(screen.getByRole('button', { name: 'Download HTML' })).toBeTruthy();
});
test('manager snapshot creation remains draft-only and displays returned version/date instead of fabricating metadata', async () => {
  useAuth.mockReturnValue({ user: { role: 'portfolio_manager' } }); const apiClient = client(); render(<ReportHistoryPanel strategyId="s1" periodId="p1" apiClient={apiClient}/>);
  await screen.findByText('Recorded officer brief'); fireEvent.click(screen.getByRole('button', { name: 'Save recorded draft snapshot' }));
  await screen.findByText(/snapshot version 5 saved/); expect(apiClient.post).toHaveBeenCalledWith('/reports/periods/p1/snapshots', { status: 'draft' }); expect(screen.getByText(/Snapshot version 5/)).toBeTruthy();
});
test('clear missing period and failure states never show demo data', async () => {
  const apiClient = client(); const { rerender } = render(<ReportHistoryPanel strategyId="s1" apiClient={apiClient}/>); expect(screen.getByText(/Choose a strategy and reporting period/)).toBeTruthy(); expect(apiClient.get).not.toHaveBeenCalled();
  apiClient.get.mockRejectedValue({ response: { status: 404 } }); rerender(<ReportHistoryPanel strategyId="s1" periodId="p1" apiClient={apiClient}/>);
  await waitFor(() => expect(screen.getAllByRole('alert').length).toBe(2)); expect(screen.queryByText('72%')).toBeNull();
});
test('print button invokes browser print with isolated target styling and cleans up body class', async () => {
  const apiClient = client(); window.print = jest.fn(() => { expect(document.body.classList.contains('civicpath-report-print')).toBe(true); });
  render(<ReportHistoryPanel strategyId="s1" periodId="p1" apiClient={apiClient}/>); await screen.findByText('Recorded officer brief'); fireEvent.click(screen.getByRole('button', { name: 'Print / Save as PDF' })); expect(window.print).toHaveBeenCalledTimes(1); expect(document.body.classList.contains('civicpath-report-print')).toBe(false);
});
test('switching periods cannot render a delayed old-period report response', async () => {
  let resolveOld; const apiClient = client(); apiClient.get.mockImplementation((path) => path.includes('/old') ? new Promise((resolve) => { if (!path.endsWith('/snapshots')) resolveOld = resolve; }) : Promise.resolve(path.endsWith('/snapshots') ? response([], { hasMore: false }) : response({ ...report, strategy: { name: 'New period strategy' } })));
  const { rerender } = render(<ReportHistoryPanel strategyId="s1" periodId="old" apiClient={apiClient}/>); rerender(<ReportHistoryPanel strategyId="s1" periodId="new" apiClient={apiClient}/>);
  await screen.findByRole('heading', { name: 'New period strategy' }); await act(async () => { resolveOld(response(report)); }); expect(screen.queryByRole('heading', { name: 'Actual strategy' })).toBeNull();
});
