import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../features/AuthContext';
import { formatFundingAmount, formatFundingDate, fundingPayload, initialFundingForm, label, provenanceLabel, safeReferenceUrl, GRANT_STATUSES, PATHWAY_STATUSES } from '../lib/fundingLifecycle';
import './FundingLifecycleWorkspace.css';

const message = (error) => error.response?.data?.code === 'funding_edit_conflict'
  ? 'Another person changed this record. Your edits were not saved. Keep your notes, cancel, and reopen the record to load the latest version.'
  : error.response?.data?.error || 'The workspace could not be reached. Check your connection and retry. No sample data is shown.';
const endpoint = (kind) => kind === 'grant' ? '/grants' : '/funding-pathways';
const recordName = (kind, record) => kind === 'grant' ? record.title : record.sourceName;

export function FundingReferenceSelect({ kind, title, value, onChange, multiple = false, projectId, grantId }) {
  const [query, setQuery] = useState(''); const [options, setOptions] = useState([]);
  const [state, setState] = useState({ loading: true, error: '', truncated: false });
  useEffect(() => {
    let active = true;
    setState({ loading: true, error: '', truncated: false });
    const timer = setTimeout(() => api.get('/funding-lifecycle/options', { params: { kind, q: query } }).then((response) => {
      if (!active) return;
      setOptions(response.data.data); setState({ loading: false, error: '', truncated: response.data.meta?.truncated });
    }).catch((error) => { if (active) setState({ loading: false, error: message(error), truncated: false }); }), 200);
    return () => { active = false; clearTimeout(timer); };
  }, [kind, query]);
  const visible = options.filter((item) => {
    if (kind === 'pathways') return !projectId || item.projectId === projectId;
    if (['evidence', 'work'].includes(kind)) return (!item.projectId || item.projectId === projectId) && (!item.grantId || item.grantId === grantId);
    return true;
  });
  const selected = multiple ? value || [] : value ? [value] : [];
  const optionTitle = (item) => item.name || item.sourceName || item.title || `${item.firstName} ${item.lastName}`;
  const unavailable = selected.filter((id) => !visible.some((item) => item.id === id));
  return <fieldset className="funding-reference">
    <legend>{title}</legend>
    <label>Search {title.toLowerCase()}<input type="search" maxLength={100} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
    {state.loading && <small role="status">Loading Council references…</small>}
    {state.error && <p role="alert">{state.error}</p>}
    {state.truncated && <small>Showing up to 100 matches. Search to narrow the list.</small>}
    <label className="funding-sr-only">Select {title.toLowerCase()}
      <select multiple={multiple} value={multiple ? selected : value || ''} onChange={(event) => onChange(multiple ? Array.from(event.target.selectedOptions, (option) => option.value) : event.target.value)} disabled={state.loading || Boolean(state.error)}>
        {!multiple && <option value="">No {title.toLowerCase()} selected</option>}
        {unavailable.map((id) => <option key={id} value={id}>Current reference: {id} (not in search results)</option>)}
        {visible.map((item) => <option key={item.id} value={item.id}>{optionTitle(item)}</option>)}
      </select>
    </label>
    {multiple && <small>Use Ctrl/Cmd to select or deselect multiple records. Up to 50 links; selected IDs: {selected.length}.</small>}
  </fieldset>;
}

export function FundingRecordEditor({ kind, record, currencyCode, onCancel, onSaved }) {
  const [form, setForm] = useState(() => initialFundingForm(kind, currencyCode, record));
  const [saving, setSaving] = useState(false); const [error, setError] = useState('');
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const change = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const choose = (key) => (value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const body = fundingPayload(kind, form, record);
      const response = record ? await api.patch(`${endpoint(kind)}/${record.id}`, body) : await api.post(endpoint(kind), body);
      onSaved(response.data.data);
    } catch (issue) { setError(message(issue)); } finally { setSaving(false); }
  };
  const statusOptions = record ? [record.status, ...(record.allowedTransitions || [])] : [kind === 'grant' ? 'identified' : 'watching'];
  return <section className="funding-editor" aria-labelledby="funding-editor-heading">
    <h2 id="funding-editor-heading" tabIndex={-1} ref={heading}>{record ? 'Edit' : 'Add'} {kind === 'grant' ? 'grant' : 'funding pathway'}</h2>
    <p>Manual Council record. Each change is audited; workflow stages do not measure evidence completion or confirm funder approval.</p>
    {error && <p className="funding-error" role="alert">{error}</p>}
    <form onSubmit={submit}>
      <fieldset disabled={saving} className="funding-form-fields">
        <div className="funding-form-grid">
          {kind === 'grant' ? <><label>Grant title<input required maxLength={200} value={form.title} onChange={change('title')} /></label><label>Funder<input required maxLength={180} value={form.funder} onChange={change('funder')} /></label></> : <>
            <label>Pathway name<input required maxLength={200} value={form.sourceName} onChange={change('sourceName')} /></label>
            <label>Source type<select value={form.sourceType} onChange={change('sourceType')}>{['grant', 'loan', 'council', 'partner', 'private', 'other'].map((type) => <option key={type} value={type}>{label(type)}</option>)}</select></label>
            <label>Council-assessed fit<select value={form.fit} onChange={change('fit')}>{['strong', 'possible', 'watch'].map((fit) => <option key={fit} value={fit}>{label(fit)}</option>)}</select></label>
          </>}
          <FundingReferenceSelect kind="projects" title="Project" value={form.projectId} onChange={choose('projectId')} />
          {kind === 'grant' && <><FundingReferenceSelect kind="pathways" title="Funding pathway" value={form.fundingPathwayId} onChange={choose('fundingPathwayId')} projectId={form.projectId} /><FundingReferenceSelect kind="owners" title="Owner" value={form.leadId} onChange={choose('leadId')} /></>}
          <label>Currency<select required value={form.currencyCode} onChange={change('currencyCode')}><option value="">Choose currency</option><option value="AUD">AUD — Australian dollars</option><option value="NZD">NZD — New Zealand dollars</option></select></label>
          {kind === 'grant' ? <>
            <label>Requested amount ({form.currencyCode || 'choose currency'})<span className="funding-currency-input"><span aria-hidden="true">$</span><input aria-label={`Requested amount (${form.currencyCode || 'choose currency'})`} inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={form.requestedAmount} onChange={change('requestedAmount')} /></span></label>
            <label>Awarded amount ({form.currencyCode || 'choose currency'})<span className="funding-currency-input"><span aria-hidden="true">$</span><input aria-label={`Awarded amount (${form.currencyCode || 'choose currency'})`} inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={form.awardedAmount} onChange={change('awardedAmount')} /></span></label>
          </> : <label>Potential amount ({form.currencyCode || 'choose currency'})<span className="funding-currency-input"><span aria-hidden="true">$</span><input aria-label={`Potential amount (${form.currencyCode || 'choose currency'})`} inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" value={form.potentialAmount} onChange={change('potentialAmount')} /></span></label>}
          <label>Lifecycle stage<select value={form.status} onChange={change('status')}>{statusOptions.map((status) => <option key={status} value={status}>{label(status)}</option>)}</select></label>
          <label>{kind === 'grant' ? 'Application due date' : 'Next due date'}<input type="date" min="1900-01-01" max="2200-12-31" value={form.dueDate} onChange={change('dueDate')} /></label>
          {kind === 'grant' && <label>Acquittal due date<input type="date" min="1900-01-01" max="2200-12-31" value={form.acquittalDueDate} onChange={change('acquittalDueDate')} /></label>}
          <label>Public source reference (HTTPS)<input type="url" maxLength={1000} value={form.sourceUrl} onChange={change('sourceUrl')} placeholder="https://funding-body.gov.au/program" /></label>
          {kind === 'grant' && <><FundingReferenceSelect kind="evidence" title="Evidence links" multiple value={form.evidenceIds} onChange={choose('evidenceIds')} projectId={form.projectId} grantId={record?.id} /><FundingReferenceSelect kind="work" title="Work links" multiple value={form.workItemIds} onChange={choose('workItemIds')} projectId={form.projectId} grantId={record?.id} /></>}
          <label className="funding-form-wide">Council notes<textarea maxLength={10000} rows={4} value={kind === 'grant' ? form.notes : form.note} onChange={change(kind === 'grant' ? 'notes' : 'note')} /></label>
          <label className="funding-form-wide">Audit reason<input required maxLength={500} value={form.reason} onChange={change('reason')} placeholder="Why is this record being created or changed?" /></label>
        </div>
        <p>Amounts are optional unless the grant is awarded or in delivery. Changing currency requires re-entering both grant amounts (or clearing them); this is not a currency conversion.</p>
        <div className="funding-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancel</button><button type="submit" className="primary-button">{saving ? 'Saving…' : 'Save audited record'}</button></div>
      </fieldset>
    </form>
  </section>;
}

function FundingRecordDetail({ kind, record, history, canWrite, busy, onEdit, onClose, onArchived }) {
  const [reason, setReason] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  const heading = useRef(null);
  useEffect(() => { heading.current?.focus(); }, [record.id]);
  const archive = async (event) => {
    event.preventDefault(); setSaving(true); setError('');
    try { const response = await api.post(`${endpoint(kind)}/${record.id}/${record.archivedAt ? 'reactivate' : 'archive'}`, { version: record.version, updatedAt: record.updatedAt, reason }); onArchived(response.data.data); }
    catch (issue) { setError(message(issue)); } finally { setSaving(false); }
  };
  const sourceUrl = safeReferenceUrl(record.sourceUrl);
  return <section className="funding-detail" aria-labelledby="funding-detail-heading">
    <div className="funding-actions"><h2 tabIndex={-1} ref={heading} id="funding-detail-heading">{recordName(kind, record)}</h2><button type="button" className="secondary-button" onClick={onClose}>Close detail</button></div>
    <p>{provenanceLabel(record.provenance)}. Revision {record.version}. {record.archivedAt ? `Archived ${formatFundingDate(record.archivedAt)}.` : 'Active record.'}</p>
    <dl className="funding-detail-grid">
      <div><dt>Lifecycle stage</dt><dd>{label(record.status)}</dd></div>
      {kind === 'grant' ? <>
        <div><dt>Funder</dt><dd>{record.funder}</dd></div>
        <div><dt>Owner</dt><dd>{record.ownerName || record.leadId || 'Unassigned'}</dd></div>
        <div><dt>Requested amount</dt><dd>{formatFundingAmount(record.requestedAmount, record.currencyCode)}</dd></div>
        <div><dt>Awarded amount</dt><dd>{formatFundingAmount(record.awardedAmount, record.currencyCode)}</dd></div>
        <div><dt>Acquittal due date</dt><dd>{formatFundingDate(record.acquittalDueDate)}</dd></div>
        <div><dt>Funding pathway</dt><dd>{record.pathwayName || record.fundingPathwayId || 'Not linked'}</dd></div>
      </> : <>
        <div><dt>Source type</dt><dd>{label(record.sourceType)}</dd></div><div><dt>Council-assessed fit</dt><dd>{label(record.fit)}</dd></div>
        <div><dt>Potential amount</dt><dd>{formatFundingAmount(record.potentialAmount, record.currencyCode)}</dd></div>
      </>}
      <div><dt>Project</dt><dd>{record.projectName || record.projectId || 'Not linked'}</dd></div>
      <div><dt>{kind === 'grant' ? 'Application due date' : 'Next due date'}</dt><dd>{formatFundingDate(record.dueDate)}</dd></div>
      <div><dt>Source reference</dt><dd>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer">Open Council-entered source reference</a> : 'Not recorded or unavailable'}</dd></div>
    </dl>
    <h3>Council notes</h3><p className="funding-notes">{(kind === 'grant' ? record.notes : record.note) || 'No notes recorded.'}</p>
    {kind === 'grant' && <>
      <h3>Evidence links</h3><p>Links and verification flags are recorded evidence, not a completion score. CivicPath does not assess funder acceptance.</p>
      {record.evidence?.length ? <ul>{record.evidence.map((item) => <li key={item.id}>{safeReferenceUrl(item.externalUrl) ? <a href={safeReferenceUrl(item.externalUrl)} target="_blank" rel="noopener noreferrer">{item.title}</a> : item.title} — {item.isVerified ? 'Marked verified in evidence register' : 'Not marked verified'}</li>)}</ul> : <p>No available evidence links.</p>}
      {record.unavailableEvidenceCount > 0 && <p>{record.unavailableEvidenceCount} linked evidence record(s) are no longer available.</p>}
      <h3>Work links</h3>{record.workItems?.length ? <ul>{record.workItems.map((item) => <li key={item.id}>{item.title} — {label(item.status)}; due {formatFundingDate(item.dueDate)}</li>)}</ul> : <p>No available work links.</p>}
      {record.unavailableWorkCount > 0 && <p>{record.unavailableWorkCount} linked work record(s) are no longer available.</p>}
      <h3>Audited lifecycle history</h3>{history.error ? <p role="alert">{history.error}</p> : history.loading ? <p role="status">Loading audit history…</p> : history.data.length ? <ol>{history.data.map((entry) => <li key={entry.id}>{formatFundingDate(entry.createdAt)} — {label(entry.action)}{entry.fromStatus && entry.toStatus ? `: ${label(entry.fromStatus)} → ${label(entry.toStatus)}` : ''}{entry.reason ? ` — ${entry.reason}` : ''}{entry.version != null ? ` (revision ${entry.version})` : ''}</li>)}</ol> : <p>No recorded lifecycle audits. Legacy origin is not verified.</p>}
      <small>Latest 100 audit entries shown.</small>
    </>}
    {canWrite && <div className="funding-detail-controls">
      {!record.archivedAt && <button type="button" className="primary-button" disabled={busy || saving} onClick={onEdit}>Edit {kind === 'grant' ? 'grant' : 'pathway'}</button>}
      <form onSubmit={archive}><label>{record.archivedAt ? 'Reactivation' : 'Archive'} audit reason<input required maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} disabled={busy || saving} /></label><button className="secondary-button" disabled={busy || saving} type="submit">{saving ? 'Saving…' : record.archivedAt ? 'Reactivate record' : 'Archive record'}</button></form>
      <small>Archival preserves the lifecycle stage and all links. Reactivation restores the record without implying a new award.</small>
      {error && <p role="alert" className="funding-error">{error}</p>}
    </div>}
  </section>;
}

export default function FundingLifecycleWorkspace({ kind }) {
  const { user } = useAuth();
  const canWrite = ['org_admin', 'portfolio_manager', 'contributor'].includes(user?.role);
  const [records, setRecords] = useState([]); const [meta, setMeta] = useState({ total: 0 });
  const [archive, setArchive] = useState('active'); const [status, setStatus] = useState(''); const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(null); const [detailLoading, setDetailLoading] = useState(false); const [detailError, setDetailError] = useState('');
  const [history, setHistory] = useState({ loading: false, data: [], error: '' });
  const [editor, setEditor] = useState(null); const [currencyCode, setCurrencyCode] = useState('');
  const [exporting, setExporting] = useState(false); const [notice, setNotice] = useState('');
  const detailRequest = useRef(0);
  const open = useCallback(async (id) => {
    const sequence = ++detailRequest.current; setDetailLoading(true); setDetailError(''); setSelected(null); setEditor(null); setHistory({ loading: kind === 'grant', data: [], error: '' });
    try {
      const response = await api.get(`${endpoint(kind)}/${id}`);
      if (sequence !== detailRequest.current) return;
      setSelected(response.data.data);
      if (kind === 'grant') {
        try { const audit = await api.get(`/grants/${id}/history`); if (sequence === detailRequest.current) setHistory({ loading: false, data: audit.data.data, error: '' }); }
        catch (issue) { if (sequence === detailRequest.current) setHistory({ loading: false, data: [], error: message(issue) }); }
      }
    } catch (issue) { if (sequence === detailRequest.current) setDetailError(message(issue)); }
    finally { if (sequence === detailRequest.current) setDetailLoading(false); }
  }, [kind]);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setRecords([]);
    api.get(endpoint(kind), { params: { archive, ...(status ? { status } : {}), limit: 50, offset } }).then((response) => {
      if (active) { setRecords(response.data.data); setMeta(response.data.meta || { total: response.data.data.length }); }
    }).catch((issue) => { if (active) setError(message(issue)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, archive, status, offset, revision]);
  useEffect(() => {
    let active = true;
    api.get('/workspace/profile').then((response) => { const currency = response.data.data.profile?.defaultCurrency; if (active && ['AUD', 'NZD'].includes(currency)) setCurrencyCode(currency); }).catch(() => { /* No guessed currency: editor requires an explicit choice. */ });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get(kind === 'grant' ? 'grantId' : 'pathwayId');
    if (id) open(id);
    return () => { detailRequest.current += 1; };
  }, [kind, open]);
  const close = () => { detailRequest.current += 1; setSelected(null); setEditor(null); setDetailError(''); setDetailLoading(false); };
  const changed = async (record) => { setEditor(null); setNotice('Record saved with an audit entry.'); setRevision((value) => value + 1); await open(record.id); };
  const exportCsv = async () => {
    setExporting(true); setNotice('');
    try {
      const response = await api.get(`${endpoint(kind)}/export.csv`, { params: { archive, ...(status ? { status } : {}) }, responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([response.data], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `civicpath-${kind === 'grant' ? 'grants' : 'funding-pathways'}.csv`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice('CSV exported for the current filters, retaining AUD/NZD units.');
    } catch (issue) {
      let detail = message(issue);
      if (issue.response?.data instanceof Blob) { try { detail = JSON.parse(await issue.response.data.text()).error || detail; } catch { /* Keep generic safe error. */ } }
      setNotice(`Export failed: ${detail}`);
    } finally { setExporting(false); }
  };
  const statuses = kind === 'grant' ? GRANT_STATUSES : PATHWAY_STATUSES;
  return <main className="page-content funding-lifecycle-workspace">
    <div className="page-toolbar"><div><h1>{kind === 'grant' ? 'Manual grant lifecycle' : 'Council funding pathways'}</h1><p className="page-intro">{kind === 'grant' ? 'Track Council-entered applications, owners, dates, amounts and linked evidence through an audited lifecycle.' : 'Record Council-assessed strategic funding options linked to your projects. A pathway is not an application or secured funding.'}</p></div>
      {canWrite && <button type="button" className="primary-button" disabled={loading || Boolean(error) || detailLoading} onClick={() => { close(); setEditor({ record: null }); }}>Add {kind === 'grant' ? 'grant' : 'funding pathway'}</button>}
    </div>
    <p className="funding-provenance">Manual Council workspace — no automated discovery feed and no GrantMaestro connection. Source references are entered by Council, not independently verified.</p>
    {!canWrite && <p className="data-note">Read-only view. Executive and other viewer roles cannot create, edit, archive or reactivate records.</p>}
    <div className="funding-filters">
      <label>Record visibility<select value={archive} onChange={(event) => { setArchive(event.target.value); setOffset(0); }}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All records</option></select></label>
      <label>Filter lifecycle stage<select value={status} onChange={(event) => { setStatus(event.target.value); setOffset(0); }}><option value="">All stages</option>{statuses.map((stage) => <option value={stage} key={stage}>{label(stage)}</option>)}</select></label>
      <button type="button" className="secondary-button" disabled={loading || Boolean(error) || exporting} onClick={exportCsv}>{exporting ? 'Exporting…' : 'Export CSV'}</button>
      <button type="button" className="secondary-button" disabled={loading} onClick={() => setRevision((value) => value + 1)}>Reload list</button>
    </div>
    {notice && <p role="status">{notice}</p>}
    {loading ? <p role="status">Loading Council {kind === 'grant' ? 'grants' : 'pathways'}…</p> : error ? <p role="alert" className="funding-error">{error} Use Reload list to retry. If unavailable, ask your administrator to enable the funding lifecycle API and migration 019.</p> : <>
      <p>{meta.total} matching record(s). Amounts are shown separately in their recorded currencies; no combined AUD/NZD total is implied.</p>
      {records.length ? <div className="funding-records">{records.map((record) => <article className="funding-record" key={record.id}>
        <span className="grant-status">{label(record.status)}{record.archivedAt ? ' · Archived' : ''}</span><h2>{recordName(kind, record)}</h2>
        {kind === 'grant' && <p>{record.funder}</p>}
        <p>{kind === 'grant' ? 'Requested' : 'Potential'}: <strong>{formatFundingAmount(kind === 'grant' ? record.requestedAmount : record.potentialAmount, record.currencyCode)}</strong></p>
        {kind === 'grant' && <p>Awarded: <strong>{formatFundingAmount(record.awardedAmount, record.currencyCode)}</strong></p>}
        <p>Due: {formatFundingDate(record.dueDate)}</p><small>{provenanceLabel(record.provenance)}</small>
        <div className="funding-actions"><button type="button" className="secondary-button" onClick={() => open(record.id)} disabled={detailLoading}>Open {kind === 'grant' ? 'lifecycle' : 'pathway'}</button><a href={`?${kind === 'grant' ? 'grantId' : 'pathwayId'}=${encodeURIComponent(record.id)}`}>Record link</a></div>
      </article>)}</div> : <p>No {archive === 'archived' ? 'archived' : 'matching'} records. {canWrite ? 'Add a manual Council record to begin, or change your filters.' : 'Ask an authorised Council team member to enter records, or change your filters.'}</p>}
      <nav aria-label="Funding record pagination" className="funding-actions"><button className="secondary-button" type="button" disabled={offset === 0} onClick={() => setOffset((value) => Math.max(0, value - 50))}>Previous page</button><span>Page {Math.floor(offset / 50) + 1}</span><button className="secondary-button" type="button" disabled={offset + 50 >= meta.total} onClick={() => setOffset((value) => value + 50)}>Next page</button></nav>
    </>}
    {detailLoading && <p role="status">Loading record detail…</p>}
    {detailError && <p role="alert" className="funding-error">{detailError}</p>}
    {editor && canWrite ? <FundingRecordEditor kind={kind} record={editor.record} currencyCode={currencyCode} onCancel={() => setEditor(null)} onSaved={changed} /> : selected && <FundingRecordDetail kind={kind} record={selected} history={history} canWrite={canWrite} busy={detailLoading} onClose={close} onEdit={() => setEditor({ record: selected })} onArchived={changed} />}
  </main>;
}
