import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { isLiveMaintenanceId } from './RecordMaintenanceWorkspace';
import './ArchiveRecoveryPanel.css';

export const archiveKinds = [
  ['projects', 'Projects'], ['actions', 'Strategy actions'], ['work-items', 'Work items'],
  ['evidence', 'Project evidence'], ['milestones', 'Milestones'], ['measures', 'Measures'],
  ['action-evidence', 'Action evidence'], ['funding', 'Funding positions'],
  ['stakeholders', 'Stakeholders'], ['risks', 'Risks and issues'], ['decisions', 'Decisions'],
];
const readers = ['org_admin', 'portfolio_manager', 'contributor', 'executive'];
const managers = ['org_admin', 'portfolio_manager'];
const title = (record) => record.name || record.title || record.sourceName || 'Retained record';
const failureMessage = (error) => error.response?.data?.error || 'Archived records could not be loaded. Check your access and retry.';

export function ArchiveRecoveryPanel({ role = 'executive', initialKind = 'projects', strategyId, onRestored, client = api }) {
  const [kind, setKind] = useState(archiveKinds.some(([key]) => key === initialKind) ? initialKind : 'projects');
  const [rows, setRows] = useState([]); const [nextOffset, setNextOffset] = useState(null);
  const [record, setRecord] = useState(null); const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [notice, setNotice] = useState(''); const [confirming, setConfirming] = useState(false);
  const [conflict, setConflict] = useState(false); const generation = useRef(0); const detailGeneration = useRef(0);
  const allowed = readers.includes(role); const canManage = managers.includes(role);
  const scope = isLiveMaintenanceId(strategyId) && ['actions', 'risks', 'decisions'].includes(kind) ? strategyId : undefined;
  const load = useCallback(async (offset = 0, current = generation.current) => {
    if (!allowed) return;
    setLoading(true); setError('');
    try {
      // Archive filtering is page-local: an empty page can still have more pages.
      const response = await client.get(`/maintenance/${kind}`, { params: { archived: 'true', limit: 25, offset, ...(scope ? { strategyId: scope } : {}) } });
      if (generation.current !== current) return;
      if (!Array.isArray(response.data.data) || !response.data.pagination) throw new Error('Malformed archive page');
      setRows((previous) => offset ? [...previous, ...response.data.data] : response.data.data);
      setNextOffset(response.data.pagination.hasMore ? response.data.pagination.nextOffset : null);
    } catch (failure) { if (generation.current === current) setError(failureMessage(failure)); }
    finally { if (generation.current === current) setLoading(false); }
  }, [allowed, client, kind, scope]);
  useEffect(() => {
    const current = ++generation.current; detailGeneration.current += 1;
    setRows([]); setNextOffset(null); setRecord(null); setConfirming(false); setConflict(false); setNotice(''); setBusy(false);
    load(0, current);
    return () => { generation.current += 1; detailGeneration.current += 1; };
  }, [load]);
  const inspect = async (id) => {
    if (!allowed || !isLiveMaintenanceId(id)) return;
    const current = generation.current; const detail = ++detailGeneration.current;
    setBusy(true); setError(''); setConfirming(false); setConflict(false); setRecord(null);
    try {
      const response = await client.get(`/maintenance/${kind}/${id}`);
      if (generation.current !== current || detailGeneration.current !== detail) return;
      if (response.data.data?.id !== id || response.data.data?.maintenance?.kind !== kind) throw new Error('Archive record mismatch');
      // This snapshot lives until explicit reload, never refreshed immediately before restore.
      setRecord(response.data.data);
    } catch (failure) { if (generation.current === current && detailGeneration.current === detail) setError(failureMessage(failure)); }
    finally { if (generation.current === current && detailGeneration.current === detail) setBusy(false); }
  };
  const restore = async () => {
    if (busy || conflict || !canManage || !record?.maintenance?.canRestore || !confirming || !isLiveMaintenanceId(record.id)) return;
    const current = generation.current; const selected = record;
    if (!selected.updatedAt || !Number.isInteger(selected.maintenance.version)) { setError('Reload this record to obtain valid restore preconditions.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await client.post(`/maintenance/${kind}/${selected.id}/restore`, { expectedUpdatedAt: selected.updatedAt, expectedVersion: selected.maintenance.version });
      if (generation.current !== current) return;
      if (response.data.data?.id !== selected.id || response.data.data?.maintenance?.archivedAt) throw new Error('Restore was not confirmed');
      setRows((previous) => previous.filter((item) => item.id !== selected.id)); setRecord(response.data.data); setConfirming(false);
      setNotice('Record restored without deletion or a change to its delivery status. A previously inactive action may remain inactive.');
      if (onRestored) {
        try { await onRestored(response.data.data, kind); }
        catch { if (generation.current === current) setError('Restoration was saved, but the active view could not refresh. Refresh that view before continuing.'); }
      }
    } catch (failure) {
      if (generation.current !== current) return;
      setConflict([409, 428].includes(failure.response?.status));
      setError([409, 428].includes(failure.response?.status) ? `${failureMessage(failure)} No automatic retry was made. Load latest record and compare before confirming again.` : failureMessage(failure));
    } finally { if (generation.current === current) setBusy(false); }
  };
  if (!allowed) return null;
  return <section className="archive-recovery-panel settings-card" aria-label="Archived record recovery" aria-busy={loading || busy}>
    <p className="card-eyebrow">Non-destructive recovery</p><h3>Archived records</h3>
    <p>Find retained records even after they disappear from the active register. Restore parents before editing their supporting records. Archive is not completion, cancellation or erasure.</p>
    <label>Record type<select value={kind} disabled={busy || loading} onChange={(event) => setKind(event.target.value)}>{archiveKinds.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
    {scope && <p>Showing records in the selected authorised strategy. Other record types use the Council archive.</p>}
    <button type="button" disabled={loading || busy} onClick={() => load(0)}>Refresh archive list</button>
    {loading && <p role="status">Loading archived records…</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!loading && !error && !rows.length && <p>No archived records in the loaded pages.{nextOffset !== null ? ' Continue loading to search later pages.' : ''}</p>}
    <ul>{rows.map((item) => <li key={item.id}><span><b>{title(item)}</b><small>Record ID: {item.id}</small><small>{item.maintenance?.archiveReason || 'No archive reason recorded'}</small></span><button type="button" disabled={busy || loading} onClick={() => inspect(item.id)}>Inspect {title(item)}</button></li>)}</ul>
    {nextOffset !== null && <button type="button" disabled={loading || busy} onClick={() => load(nextOffset)}>Load more archive pages</button>}
    {record && <section className="archive-recovery-detail" aria-label="Archived record detail"><h4>{title(record)}</h4><p>Record ID: {record.id} · Revision {record.maintenance.version}</p><p>{record.maintenance.archivedAt ? 'Archived' : 'Not archived'}{record.maintenance.archiveReason ? ` — ${record.maintenance.archiveReason}` : ''}</p>
      {record.maintenance.readOnlyReason && <p>{record.maintenance.readOnlyReason}</p>}
      <button type="button" disabled={busy} onClick={() => inspect(record.id)}>{conflict ? 'Load latest record and compare' : 'Reload record'}</button>
      {canManage && record.maintenance.canRestore && !confirming && <button type="button" disabled={busy || conflict} onClick={() => setConfirming(true)}>Restore retained record</button>}
      {confirming && <div role="group" aria-label="Restore confirmation"><p>Restore this retained record using revision {record.maintenance.version}? Its original delivery state and relationships are preserved.</p><button type="button" disabled={busy || conflict} onClick={restore}>Confirm restore</button><button type="button" disabled={busy} onClick={() => setConfirming(false)}>Cancel restore</button></div>}
    </section>}
    {!canManage && <p>Read-only archive view. Ask an Organisation Administrator or Portfolio Manager to restore a record.</p>}
  </section>;
}
export default ArchiveRecoveryPanel;
