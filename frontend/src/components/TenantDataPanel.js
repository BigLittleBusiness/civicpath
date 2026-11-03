import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import './TenantDataPanel.css';

const label = (value) => String(value || '').replace(/_/g, ' ');
export const lifecycleErrorMessage = (error) => error.response?.data?.error || 'Tenant data controls could not be completed. Please retry or contact your administrator.';
export function TenantDataPanel({ role = 'org_admin', client = api }) {
  const [data, setData] = useState(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(''); const [kind, setKind] = useState('closure'); const [reason, setReason] = useState('');
  const [attachmentKind, setAttachmentKind] = useState('support'); const [attachmentId, setAttachmentId] = useState(''); const [attachments, setAttachments] = useState([]);
  const allowed = ['org_admin', 'executive'].includes(role);
  const load = useCallback(async () => {
    if (!allowed) { setLoading(false); return; }
    setLoading(true); setError('');
    try { const response = await client.get('/tenant-lifecycle'); setData(response.data.data); }
    catch (failure) { setError(lifecycleErrorMessage(failure)); }
    finally { setLoading(false); }
  }, [allowed, client]);
  useEffect(() => { load(); }, [load]);
  const run = async (work) => { setBusy(true); setError(''); setNotice(''); try { await work(); } catch (failure) { setError(lifecycleErrorMessage(failure)); } finally { setBusy(false); } };
  const createExport = () => run(async () => {
    const response = await client.post('/tenant-lifecycle/exports', {}, { timeout: 30000 });
    setNotice(`Complete workspace export ${response.data.data.id} is ready. Download within one hour.`); await load();
  });
  const download = (record) => run(async () => {
    const response = await client.get(`/tenant-lifecycle/exports/${record.id}/download`, { responseType: 'blob', timeout: 30000 });
    const blob = response.data instanceof Blob ? response.data : new Blob([typeof response.data === 'string' ? response.data : JSON.stringify(response.data)], { type: 'application/json' });
    const document = JSON.parse(await blob.text()); setAttachments(document.attachmentManifest || []);
    const url = URL.createObjectURL(blob); const anchor = documentNode('a');
    anchor.href = url; anchor.download = `civicpath-workspace-${record.id}.json`; anchor.click(); anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Export download was authorised and audited. Store this personal-data file securely; attachment binaries are requested separately.'); await load();
  });
  const submitRequest = (event) => { event.preventDefault(); run(async () => {
    await client.post('/tenant-lifecycle/requests', { kind, reason }); setReason('');
    setNotice(kind === 'legal_hold' ? 'Legal hold requested; precautionary preservation is active immediately.' : 'Request recorded for platform review. No data has been erased.'); await load();
  }); };
  const requestAttachment = (event) => { event.preventDefault(); run(async () => {
    await client.post('/tenant-lifecycle/attachment-requests', { kind: attachmentKind, attachmentId }); setAttachmentId('');
    setNotice('Private attachment delivery request recorded for human verification. No public link was created.'); await load();
  }); };
  if (!allowed) return <section className="settings-card tenant-data-panel"><h3>Tenant data ownership</h3><p>These controls are available to Organisation Administrators and read-only Executives.</p></section>;
  return <section className="settings-card tenant-data-panel" aria-labelledby="tenant-data-heading" aria-busy={busy || loading}>
    <p className="card-eyebrow">Data ownership & exit</p><h3 id="tenant-data-heading">Your Council data, under controlled stewardship.</h3>
    <p>A current active Organisation Administrator can recover a workspace export even after subscription entitlement ends, unless the tenant is suspended. Every status view, export and download authorization is audited.</p>
    {error && <p className="form-message" role="alert">{error}</p>}{notice && <p className="tenant-data-notice" role="status">{notice}</p>}
    <button type="button" className="secondary-button" disabled={busy} onClick={load}>{loading ? 'Loading…' : 'Refresh data controls'}</button>
    {data && <>
      <div className="tenant-data-guardrail"><strong>{data.holdActive ? 'Legal hold active — closure and erasure are blocked.' : 'Retention schedule and data erasure are disabled.'}</strong><p>No workspace retention duration is approved. Closure requires independent platform approval and human-verified backup/object-version treatment; approval suspends the workspace and revokes users without deleting council records.</p></div>
      <h4>Workspace export</h4><p>The schema-manifest JSON includes current council collaboration, strategy, grants, project and safe support metadata. Credentials, MFA, system settings, internal notes, signed URLs and storage keys are excluded. Attachments have an authenticated private-delivery request manifest, not public URLs.</p>
      <p>Bounded export: {data.limits?.maxRows?.toLocaleString()} rows / {Math.round((data.limits?.maxBytes || 0) / 1048576)} MiB. If your workspace exceeds the limits, contact the platform administrator for a supervised complete export; partial exports are never marked complete.</p>
      {data.capabilities?.canExport && <button type="button" className="primary-button" onClick={createExport} disabled={busy}>{busy ? 'Working…' : 'Prepare complete workspace export'}</button>}
      <ul className="tenant-data-records" aria-label="Workspace exports">{(data.exports || []).map((record) => <li key={record.id}><div><strong>{label(record.status)}</strong><span>{record.rowCount || 0} rows · {record.byteCount || 0} bytes</span><small>Export ID: {record.id}</small>{record.errorCode && <small>{label(record.errorCode)} — request supervised support if the limit is exceeded.</small>}</div>{record.status === 'ready' && <button type="button" className="secondary-button" disabled={busy} onClick={() => download(record)}>Download audited JSON</button>}</li>)}</ul>
      {!data.exports?.length && <p>No recent exports are available.</p>}
      {data.capabilities?.canRequest && <>
        <h4>Controlled closure, retention & legal hold</h4><form onSubmit={submitRequest} className="tenant-data-form"><label>Request type<select value={kind} onChange={(event) => setKind(event.target.value)}><option value="closure">Close workspace access (no erasure)</option><option value="retention">Request leadership retention review</option><option value="legal_hold">Request legal hold (preserve immediately)</option><option value="release_hold">Request independent legal hold release</option></select></label><label>Reason / records stewardship instructions<textarea required minLength={8} maxLength={2000} value={reason} onChange={(event) => setReason(event.target.value)}/></label><p>Do not include credentials or privileged legal advice. Retention requests do not set a duration; leadership must supply approved policy.</p><button className="primary-button" type="submit" disabled={busy || (kind === 'closure' && data.holdActive)}>{kind === 'closure' && data.holdActive ? 'Closure blocked by legal hold' : 'Submit for platform review'}</button></form>
        <h4>Private attachment recovery</h4><p>Download an export to see its attachment list, or use an attachment ID from its manifest. Each request is scoped to your Council and recorded for human-verified private delivery. Binary retrieval is not yet automated.</p>
        {!!attachments.length && <label>Choose an exported attachment<select value={`${attachmentKind}:${attachmentId}`} onChange={(event) => { const [selectedKind, id] = event.target.value.split(':'); setAttachmentKind(selectedKind || 'support'); setAttachmentId(id || ''); }}><option value="support:">Select attachment</option>{attachments.map((row) => <option key={row.id} value={`${row.kind}:${row.id}`}>{row.originalFilename || row.title || row.id}</option>)}</select></label>}
        <form className="tenant-data-form" onSubmit={requestAttachment}><label>Attachment kind<select value={attachmentKind} onChange={(event) => setAttachmentKind(event.target.value)}><option value="support">Support attachment</option><option value="evidence">Project evidence document</option></select></label><label>Attachment ID<input required value={attachmentId} onChange={(event) => setAttachmentId(event.target.value)} pattern="[0-9a-fA-F-]{36}" maxLength={36}/></label><button className="secondary-button" type="submit" disabled={busy}>Request private delivery</button></form>
        <ul className="tenant-data-records" aria-label="Attachment requests">{(data.attachmentRequests || []).map((record) => <li key={record.id}><span>{record.attachmentId}: {label(record.status)}</span></li>)}</ul>
      </>}
      <h4>Recent lifecycle requests</h4><ul className="tenant-data-records" aria-label="Lifecycle requests">{(data.requests || []).map((record) => <li key={record.id}><div><strong>{label(record.kind)} · {label(record.status)}</strong><p>{record.reason}</p>{record.reviewNote && <p>Review: {record.reviewNote}</p>}</div></li>)}</ul>{!data.requests?.length && <p>No lifecycle requests recorded.</p>}
      {role === 'executive' && <p>Executive access is read-only. Contact your Organisation Administrator for export or lifecycle requests.</p>}
      <p className="tenant-data-footnote">Backups: {data.policy?.backups} Object versions: {data.policy?.objectVersions} Recent history is bounded; full current lifecycle metadata is included in an authorised export.</p>
    </>}
  </section>;
}
// Avoid shadowing the downloaded JSON document with the browser DOM.
function documentNode(tag) { const node = window.document.createElement(tag); window.document.body.appendChild(node); return node; }
export default TenantDataPanel;
