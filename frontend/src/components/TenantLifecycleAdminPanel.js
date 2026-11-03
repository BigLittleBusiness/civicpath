import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { PrivilegedActionModal } from './PrivilegedActionModal';
import { lifecycleErrorMessage } from './TenantDataPanel';
import './TenantDataPanel.css';

const label = (value) => String(value || '').replace(/_/g, ' ');
export function TenantLifecycleAdminPanel({ organizationId, role = 'platform_admin', client = api }) {
  const [data, setData] = useState(null); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [requestId, setRequestId] = useState(''); const [decision, setDecision] = useState('review'); const [note, setNote] = useState(''); const [reference, setReference] = useState('');
  const [humanVerified, setHumanVerified] = useState(false); const [backupsVerified, setBackupsVerified] = useState(false); const [versionsVerified, setVersionsVerified] = useState(false); const [action, setAction] = useState(null);
  const load = useCallback(async () => {
    if (role !== 'platform_admin' || !organizationId) return;
    setLoading(true); setError('');
    try { const response = await client.get(`/admin/tenant-lifecycle/${organizationId}`); setData(response.data.data); }
    catch (failure) { setError(lifecycleErrorMessage(failure)); } finally { setLoading(false); }
  }, [client, organizationId, role]);
  useEffect(() => { load(); }, [load]);
  const selected = data?.requests?.find((row) => row.id === requestId);
  const submit = (event) => {
    event.preventDefault(); setNotice('');
    setAction({ label: `${decision} ${label(selected?.kind)} for ${data?.organization?.name || 'this Council'}`,
      execute: async () => {
        await client.post(`/admin/tenant-lifecycle/${organizationId}/requests/${requestId}/review`, { decision, note,
          ...(decision === 'approve' ? { humanVerified, backupTreatmentVerified: backupsVerified, objectVersionsVerified: versionsVerified, approvalReference: reference } : {}) });
        setNotice('Verified platform decision recorded. Closure ends access only; workspace data, backups and object versions are preserved.');
        setNote(''); setReference(''); setHumanVerified(false); setBackupsVerified(false); setVersionsVerified(false); setRequestId(''); await load();
      } });
  };
  if (role !== 'platform_admin') return <section className="settings-card tenant-data-panel"><h3>Tenant lifecycle review</h3><p>Platform Administrator access is required.</p></section>;
  return <section className="settings-card tenant-data-panel" aria-labelledby="tenant-lifecycle-review-heading" aria-busy={loading}>
    <p className="card-eyebrow">Platform stewardship</p><h3 id="tenant-lifecycle-review-heading">Tenant lifecycle review</h3>
    <p>Review Council requests with fresh password and authenticator verification. Independent verified approval is mandatory. No purge, backup deletion, object-version deletion or retention timer can be started here.</p>
    {error && <p role="alert" className="form-message">{error}</p>}{notice && <p role="status" className="tenant-data-notice">{notice}</p>}
    {!organizationId && <p>Select a Council customer to review its lifecycle requests.</p>}
    {organizationId && <button type="button" className="secondary-button" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh lifecycle review'}</button>}
    {data && <><h4>{data.organization?.name}</h4><div className="tenant-data-guardrail"><strong>{data.holdActive ? 'Legal hold active: closure is blocked.' : 'No active legal hold recorded.'}</strong><p>Retention policy unconfigured; all erasure and retention scheduling remain disabled. Verified closure suspends access and revokes sessions atomically, without deleting records. A rejected hold request does not release precautionary preservation.</p></div>
      <ul className="tenant-data-records" aria-label="Platform lifecycle requests">{(data.requests || []).map((row) => <li key={row.id}><div><strong>{label(row.kind)} · {label(row.status)}</strong><p>{row.reason}</p><small>Request ID: {row.id}</small>{row.reviewNote && <p>Review: {row.reviewNote}</p>}</div></li>)}</ul>
      {!data.requests?.length && <p>No requests require review.</p>}
      <form className="tenant-data-form" onSubmit={submit}>
        <label>Pending request<select required value={requestId} onChange={(event) => setRequestId(event.target.value)}><option value="">Select request</option>{(data.requests || []).filter((row) => ['pending', 'reviewed'].includes(row.status)).map((row) => <option value={row.id} key={row.id}>{label(row.kind)} — {row.reason.slice(0, 60)}</option>)}</select></label>
        <label>Decision<select value={decision} onChange={(event) => setDecision(event.target.value)}><option value="review">Record review</option><option value="approve">Approve after verified authorisation</option><option value="reject">Reject request</option></select></label>
        <label>Review rationale<textarea required minLength={8} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)}/></label>
        {decision === 'approve' && <><label>Human approval / legal authority reference<input required minLength={8} maxLength={240} value={reference} onChange={(event) => setReference(event.target.value)}/></label><label className="tenant-data-check"><input type="checkbox" checked={humanVerified} onChange={(event) => setHumanVerified(event.target.checked)} required/>I independently verified the requester, Council authority, applicable legal obligations and approval.</label><label className="tenant-data-check"><input type="checkbox" checked={backupsVerified} onChange={(event) => setBackupsVerified(event.target.checked)} required/>Backup inventory, preservation and restore suppression treatment were reviewed; no backup deletion is authorised.</label><label className="tenant-data-check"><input type="checkbox" checked={versionsVerified} onChange={(event) => setVersionsVerified(event.target.checked)} required/>Object versions, replicas and legal-hold flags were inventoried and preservation verified; no object deletion is authorised.</label></>}
        {decision === 'approve' && selected?.kind === 'retention' && <p role="alert">Retention approval is disabled until leadership configures an approved policy.</p>}
        <button className="primary-button" type="submit" disabled={!requestId || (decision === 'approve' && (selected?.kind === 'retention' || (selected?.kind === 'closure' && data.holdActive)))}>Verify security and submit decision</button>
      </form>
      <h4>Private attachment requests</h4><p>Delivery must be tenant-scoped, human-verified and private. This panel does not generate signed/public URLs or call storage providers.</p><ul className="tenant-data-records" aria-label="Private attachment queue">{(data.attachmentRequests || []).map((row) => <li key={row.id}><span>{row.kind} · {row.attachmentId} · {label(row.status)}</span></li>)}</ul>
      <p className="tenant-data-footnote">{data.policy?.backups} {data.policy?.objectVersions}</p>
    </>}
    <PrivilegedActionModal action={action} onClose={() => setAction(null)}/>
  </section>;
}
export default TenantLifecycleAdminPanel;
