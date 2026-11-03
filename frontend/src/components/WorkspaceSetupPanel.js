import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, importCsv } from '../lib/api';
import { Icon } from './Icon';
import { ContextualHelpLink } from './RoleHelpPanel';
import { useAuth } from '../features/AuthContext';
import { isDemoWorkspace, loadSetupEvidence, setupItems, workspaceKey } from '../lib/trustData.mjs';

const entityOptions = { projects: ['Project register', 'name, priority, category, stage, estimated_cost, target_funding, expected_jobs, target_date'], grants: ['Grant register', 'title, funder, project, requested_amount, status, due_date, acquittal_due_date'] };

export function WorkspaceProfilePanel({ user }) {
  const key = workspaceKey(user); const isAdmin = user?.role === 'org_admin';
  const currentKey = useRef(key); currentKey.current = key;
  const [state, setState] = useState({ key: null, status: 'loading', data: null });
  const [form, setForm] = useState(null); const [saving, setSaving] = useState(false); const [reload, setReload] = useState(0); const [error, setError] = useState('');
  useEffect(() => {
    let mounted = true; setState({ key, status: 'loading', data: null }); setForm(null); setError('');
    loadSetupEvidence(api, user, { includeMembers: false }).then((evidence) => {
      if (!mounted) return;
      setState({ key, status: evidence.profile ? 'success' : 'error', data: evidence.profile }); setForm(evidence.profile?.profile || null);
    });
    return () => { mounted = false; };
  }, [key, reload, user]);
  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  const submit = async (event) => {
    event.preventDefault(); if (!isAdmin || saving || !form || state.key !== key) return;
    setSaving(true); setError('');
    try {
      const { name, operatingContactName, operatingContactRole, operatingContactEmail, workspaceOwnerId } = form;
      const response = await api.patch('/workspace/profile', { name, operatingContactName, operatingContactRole, operatingContactEmail, workspaceOwnerId: workspaceOwnerId || null });
      if (response.data.data?.id !== user.organizationId) throw new Error('Unverified workspace profile');
      if (currentKey.current !== key) return;
      setForm(response.data.data); toast.success('Workspace profile saved.');
    } catch (failure) { if (currentKey.current === key) setError(failure.response?.data?.error || 'Workspace profile could not be confirmed. Refresh before trying again.'); }
    finally { setSaving(false); }
  };
  if (state.key !== key || state.status === 'loading') return <section className="settings-card"><p className="card-eyebrow">Workspace identity</p><p role="status" className="card-copy">Loading workspace profile…</p></section>;
  if (!form || state.status === 'error') return <section className="settings-card"><p className="card-eyebrow">Workspace identity</p><p role="alert" className="card-copy">Workspace profile could not be verified.</p><button className="secondary-button" type="button" onClick={() => setReload((value) => value + 1)}>Retry workspace profile</button></section>;
  const data = state.data; const owner = data?.eligibleOwners?.find((member) => member.id === form.workspaceOwnerId);
  return <section className="settings-card"><div><p className="card-eyebrow">Workspace identity</p><h3>{form.name}</h3><p className="card-copy">Keep the accountable Council contact and workspace owner clear. Billing address and tax details are managed securely through Stripe by the Organisation Administrator.</p></div>{isAdmin ? <form className="workspace-profile-form" onSubmit={submit}><div className="field-grid"><label>Council or organisation name<input value={form.name} maxLength={160} onChange={set('name')} required/></label><label>Country<input value={form.country === 'NZ' ? 'New Zealand' : 'Australia'} disabled/></label><label>Operating contact name<input value={form.operatingContactName || ''} maxLength={160} onChange={set('operatingContactName')} placeholder="Primary delivery contact"/></label><label>Operating contact role<input value={form.operatingContactRole || ''} maxLength={160} onChange={set('operatingContactRole')} placeholder="e.g. Economic Development Manager"/></label><label>Operating contact email<input type="email" maxLength={191} value={form.operatingContactEmail || ''} onChange={set('operatingContactEmail')} placeholder="name@council.gov.au"/></label><label>Workspace owner<select value={form.workspaceOwnerId || ''} onChange={set('workspaceOwnerId')}><option value="">Choose an accountable owner</option>{data?.eligibleOwners?.map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName} · {member.role.replace(/_/g, ' ')}</option>)}</select></label></div>{error && <p role="alert" className="form-message">{error}</p>}<button className="secondary-button" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save workspace profile'}</button></form> : <><dl><dt>Workspace owner</dt><dd>{owner ? `${owner.firstName} ${owner.lastName}` : 'No eligible active owner recorded'}</dd><dt>Operating contact</dt><dd>{form.operatingContactName || 'Not recorded'} · {form.operatingContactRole || 'Role not recorded'}</dd><dt>Operating contact email</dt><dd>{form.operatingContactEmail || 'Not recorded'}</dd></dl><p className="settings-readonly-note">Read-only. Your Organisation Administrator manages workspace identity and accountable contacts.</p></>}</section>;
}

export function DataImportPanel({ canManage }) {
  const [entityType, setEntityType] = useState('projects'); const [file, setFile] = useState(null); const [preview, setPreview] = useState(null); const [loading, setLoading] = useState(false); const [importing, setImporting] = useState(false);
  const selected = useMemo(() => entityOptions[entityType], [entityType]);
  const choose = async (event) => { if (!canManage) return; const next = event.target.files?.[0]; if (!next) return; setFile(next); setPreview(null); setLoading(true); try { const result = await importCsv(entityType, next); setPreview(result); } catch (error) { toast.error(error.response?.data?.error || 'This CSV could not be reviewed. Use the CivicPath template and check the required columns.'); } finally { setLoading(false); } };
  const commit = async () => { if (!canManage || !preview || importing) return; setImporting(true); try { const response = await api.post('/imports/commit', { entityType, rows: preview.rows }); toast.success(`${response.data.data.created} ${entityType} imported.${response.data.data.skipped.length ? ` ${response.data.data.skipped.length} row(s) need review.` : ''}`); setFile(null); setPreview(null); } catch (error) { toast.error(error.response?.data?.error || 'The import could not be completed.'); } finally { setImporting(false); } };
  const download = entityType === 'projects' ? '/civicpath-project-import-template.csv' : '/civicpath-grant-import-template.csv';
  return <section className="settings-card import-card"><div><p className="card-eyebrow">Data import</p><h3>Start from the register you already use.</h3><p className="card-copy">CivicPath previews the prescribed columns before importing. No demonstration record is copied into a Council workspace.</p><p className="card-copy">Grant CSV commits are not enabled in this release. Use the <Link to="/grants">Grants workspace</Link> to record a grant with council-entered provenance, ownership and controlled lifecycle steps; a preview does not imply import is available.</p><div className="import-mapping"><b>{selected[0]} mapping</b><span>{selected[1]}</span></div><div className="import-actions"><a href={download} download>Download {entityType === 'projects' ? 'project' : 'grant'} CSV template <Icon name="external" size={14}/></a><ContextualHelpLink topic="import a project register grant register or CSV" label="Import help"/></div></div><div className="import-panel"><Icon name="upload" size={26}/><strong>{loading ? 'Reviewing file…' : preview ? 'Ready to confirm import' : file ? file.name : 'Choose a prepared CSV'}</strong><span>{preview ? `${preview.rowCount} row(s) found. Review the first rows below, then confirm.` : 'Choose the register type and upload its CivicPath template.'}</span>{canManage ? <><select value={entityType} onChange={(event) => { setEntityType(event.target.value); setFile(null); setPreview(null); }}><option value="projects">Project register</option></select><label className="secondary-button upload-button">Choose CSV<input type="file" accept=".csv,text/csv" onChange={choose}/></label></> : <p className="settings-readonly-note">Organisation Administrators and Portfolio Managers can import registers.</p>}</div>{preview ? <div className="import-preview"><div className="import-preview-head"><b>Import preview</b><span>{preview.rowCount} row(s)</span></div><div className="import-table">{preview.headers.map((header) => <b key={header}>{header}</b>)}{preview.preview.flatMap((row, index) => preview.headers.map((header) => <span key={`${index}-${header}`}>{row[header] || '—'}</span>))}</div><div className="import-preview-actions"><small>Confirming imports these records to this Council only. Review ownership, dates and amounts after import.</small><button className="primary-button" type="button" onClick={commit} disabled={importing}>{importing ? 'Importing…' : `Import ${preview.rowCount} ${entityType}`}</button></div></div> : null}</section>;
}

export function SetupChecklist({ projectCount = null, strategyCount = null }) {
  const { user } = useAuth(); const key = workspaceKey(user);
  const [state, setState] = useState({ key: null, status: 'loading', evidence: null });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let mounted = true;
    setState({ key, status: 'loading', evidence: null });
    loadSetupEvidence(api, user).then((evidence) => { if (mounted) setState({ key, status: 'success', evidence }); });
    return () => { mounted = false; };
  }, [key, reload, user]);
  const evidence = state.key === key ? state.evidence : null;
  const items = setupItems({ evidence, user, projectCount, strategyCount });
  const done = items.filter((item) => item.done).length;
  const unknown = items.filter((item) => item.status === 'unavailable').length;
  return <section className="setup-checklist"><div><p className="card-eyebrow">{isDemoWorkspace(user) ? 'Demo workspace setup' : 'Guided setup'}</p><h2>Set up the first useful operating view.</h2><p>Completion is checked against saved workspace records each time this view loads. It is not inferred from your role or stored as a browser-only tick.</p></div><div className="setup-progress"><b>{done}/{items.length}</b><span>verified foundational steps complete{unknown ? ` · ${unknown} unverified` : ''}</span></div>
    {(state.key !== key || state.status === 'loading') && <p role="status">Checking workspace owner and team readiness…</p>}
    <ol>{items.map((item) => <li key={item.title} className={item.done ? 'is-done' : ''}><i aria-hidden="true">{item.done ? '✓' : item.status === 'unavailable' ? '?' : '•'}</i><span>{item.title}<small style={{ display: 'block' }}>{item.detail}</small></span><Link to={item.to}>{item.done ? 'Review' : item.status === 'unavailable' ? 'Details' : user?.role === 'org_admin' || item.to !== '/settings' ? 'Start' : 'Details'} <Icon name="arrow" size={13}/></Link></li>)}</ol>
    <button className="secondary-button" type="button" onClick={() => setReload((value) => value + 1)} disabled={state.status === 'loading'}>Refresh owner and team status</button>
  </section>;
}
