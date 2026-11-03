import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import './recordMaintenance.css';

const label = (key) => key.replace(/Id$/, '').replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
const words = (value) => String(value || '').replace(/_/g, ' ');
export const isLiveMaintenanceId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function maintenancePayload(record, changes) {
  return { changes, expectedVersion: record.maintenance.version, expectedUpdatedAt: record.updatedAt };
}
const same = (a, b) => JSON.stringify(a === undefined ? null : a) === JSON.stringify(b === undefined ? null : b);
function initialValue(record, key, spec) {
  const value = record[key];
  if (spec.type === 'checkbox') return !!value;
  if (spec.type === 'list') return (value || []).join('\n');
  if (spec.type === 'datetime-local') return value ? new Date(value).toISOString().slice(0, 16) : '';
  return value === null || value === undefined ? '' : String(value);
}
function normalize(value, spec) {
  if (spec.type === 'checkbox') return !!value;
  if (spec.type === 'list') return String(value).split('\n').map((item) => item.trim()).filter(Boolean);
  if (value === '' && spec.nullable) return null;
  if (spec.type === 'number') return Number(value);
  if (spec.type === 'datetime-local') return value ? new Date(`${value}Z`).toISOString() : null;
  return value;
}
function ReferenceField({ field, value, onChange, strategyId, disabled }) {
  const [options, setOptions] = useState([]); const [more, setMore] = useState(null); const [loading, setLoading] = useState(false); const [error, setError] = useState('');
  const generation = useRef(0);
  const load = useCallback(async (offset = 0, generationId = generation.current) => {
    setLoading(true); setError('');
    try {
      const params = { offset };
      if (strategyId && ['actions', 'focusAreas', 'dependencies'].includes(field.reference)) params.strategyId = strategyId;
      const response = await api.get(`/maintenance/options/${field.reference}`, { params });
      if (generation.current !== generationId) return;
      setOptions((current) => offset ? [...current, ...response.data.data] : response.data.data);
      setMore(response.data.pagination.hasMore ? response.data.pagination.nextOffset : null);
    } catch (failure) { if (generation.current === generationId) setError(failure.response?.data?.error || 'Choices could not be loaded. Retry before changing this reference.'); }
    finally { if (generation.current === generationId) setLoading(false); }
  }, [field.reference, strategyId]);
  useEffect(() => { const current = ++generation.current; setOptions([]); load(0, current); return () => { generation.current += 1; }; }, [load]);
  return <span className="maintenance-reference"><select aria-label={label(field.key)} value={value} disabled={disabled || loading} required={!field.nullable} onChange={(event) => onChange(event.target.value)}>
    <option value="">Unassigned</option>
    {value && !options.some((item) => item.id === value) && <option value={value}>Current reference (not in this page)</option>}
    {options.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
  </select>{loading && <small role="status">Loading choices…</small>}{more !== null && <button type="button" onClick={() => load(more)} disabled={loading}>Load more choices</button>}{error && <span role="alert">{error} <button type="button" onClick={() => load(0)}>Retry choices</button></span>}</span>;
}
export function MaintenanceRecordEditor({ record, onSaved, compatibilityEndpoints = true }) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState({}); const [saving, setSaving] = useState(false); const [message, setMessage] = useState(''); const [conflict, setConflict] = useState(false); const [archiveDialog, setArchiveDialog] = useState(null); const [reason, setReason] = useState('');
  const mounted = useRef(true); const formSnapshot = useRef(null); const operationSnapshot = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setEditing(false); setArchiveDialog(null); setMessage(''); setConflict(false); }, [record.id]);
  const maintenance = record.maintenance; const kind = maintenance.kind;
  const title = record.name || record.title || record.sourceName || 'Delivery record';
  const begin = () => { formSnapshot.current = record; setDraft(Object.fromEntries(maintenance.editableFields.map((key) => [key, initialValue(record, key, maintenance.fields[key])]))); setMessage(''); setConflict(false); setEditing(true); };
  const reload = async () => {
    setSaving(true);
    try { const response = await api.get(`/maintenance/${kind}/${record.id}`); if (mounted.current) { onSaved(response.data.data); setEditing(false); setConflict(false); setMessage('Latest values loaded. Review them before making another change.'); } }
    catch (error) { if (mounted.current) setMessage(error.response?.data?.error || 'The latest record could not be loaded. Retry.'); }
    finally { if (mounted.current) setSaving(false); }
  };
  const send = async (operation, changes) => {
    setSaving(true); setMessage('');
    try {
      let path = `/maintenance/${kind}/${record.id}`;
      const snapshot = operation === 'edit' && editing ? formSnapshot.current || record : operationSnapshot.current || record;
      const payload = operation === 'edit' ? maintenancePayload(snapshot, changes) : { expectedVersion: snapshot.maintenance.version, expectedUpdatedAt: snapshot.updatedAt, ...(operation === 'archive' ? { reason } : {}) };
      if (operation === 'edit' && compatibilityEndpoints && ['actions', 'milestones'].includes(kind)) path = kind === 'actions' ? `/strategy-actions/${record.id}` : `/strategy-milestones/${record.id}`;
      const response = await api[operation === 'edit' ? 'patch' : 'post'](operation === 'edit' ? path : `${path}/${operation}`, payload);
      if (!mounted.current) return;
      onSaved(response.data.data); setEditing(false); setArchiveDialog(null); setReason(''); setConflict(false); setMessage(operation === 'edit' ? 'Changes saved.' : operation === 'archive' ? 'Record archived without deletion.' : 'Record restored.');
    } catch (error) {
      if (!mounted.current) return;
      setConflict(error.response?.status === 409 || error.response?.status === 428);
      setMessage(error.response?.data?.error || 'The change could not be saved. Your draft is retained; check your connection and retry.');
    } finally { if (mounted.current) setSaving(false); }
  };
  const submit = (event) => {
    event.preventDefault(); const changes = {}; const original = formSnapshot.current || record;
    for (const key of original.maintenance.editableFields) {
      // Compare form representations first: untouched legacy decimal/date values must not be rounded or rewritten.
      if (same(draft[key], initialValue(original, key, original.maintenance.fields[key]))) continue;
      const value = normalize(draft[key], maintenance.fields[key]); if (!same(value, original[key])) changes[key] = value;
    }
    if (!Object.keys(changes).length) { setMessage('No fields have changed.'); return; }
    send('edit', changes);
  };
  const completeCode = kind === 'milestones' || kind === 'work-items' ? 'complete' : kind === 'actions' ? maintenance.fields.status?.completeCode : null;
  const canComplete = completeCode && maintenance.editableFields.includes('status') && record.status !== completeCode;
  return <article className={`maintenance-record${maintenance.archivedAt ? ' is-archived' : ''}`} aria-label={`${title} maintenance`} aria-busy={saving}>
    <header><div><h5>{title}</h5><p>{words(record.status || record.decisionStatus || record.engagementStatus || record.evidenceType)}{maintenance.archivedAt && ' · Archived'} · Revision {maintenance.version}</p></div><div className="maintenance-actions">
      {!editing && maintenance.editableFields.length > 0 && <button type="button" disabled={saving} onClick={begin}>Edit {maintenance.fields.ownerId && maintenance.editableFields.includes('ownerId') ? '/ assign' : 'record'}</button>}
      {canComplete && <button type="button" disabled={saving || conflict} onClick={() => send('edit', { status: completeCode })}>Mark complete</button>}
      {maintenance.canArchive && <button type="button" disabled={saving} onClick={() => { operationSnapshot.current = record; setArchiveDialog('archive'); setReason(''); }}>Archive</button>}
      {maintenance.canRestore && <button type="button" disabled={saving} onClick={() => { operationSnapshot.current = record; setArchiveDialog('restore'); }}>Restore</button>}
    </div></header>
    {maintenance.readOnlyReason && <p className="maintenance-helper">{maintenance.readOnlyReason}</p>}
    {record.ownerId && <p className="maintenance-helper">An accountable Council owner is assigned. Managers can inspect or change the owner through Edit / assign.</p>}
    {(record.dueDate || record.targetDate) && <p className="maintenance-helper">Due / target date: {String(record.dueDate || record.targetDate).slice(0, 10)}</p>}
    {record.externalUrl && /^https?:\/\//i.test(record.externalUrl) && <p><a href={record.externalUrl} target="_blank" rel="noopener noreferrer">Open existing evidence URL</a> · {record.isVerified ? 'Verified' : 'Not verified'}</p>}
    {maintenance.archiveReason && <p><b>Archive reason:</b> {maintenance.archiveReason}</p>}
    {message && <p role={conflict ? 'alert' : 'status'} className={conflict ? 'maintenance-error' : 'maintenance-notice'}>{message}</p>}
    {conflict && <button type="button" disabled={saving} onClick={reload}>Discard draft and load latest</button>}
    {editing && <form onSubmit={submit} className="maintenance-form"><fieldset disabled={saving || conflict}><legend>Edit {title}</legend><div className="maintenance-fields">{maintenance.editableFields.map((key) => {
      const field = maintenance.fields[key]; const value = draft[key]; const change = (next) => setDraft((current) => ({ ...current, [key]: next }));
      const common = { value, onChange: (event) => change(event.target.value), required: !field.nullable };
      return <label key={key}>{label(key)}{field.type === 'reference' ? <ReferenceField field={{ ...field, key }} value={value} onChange={change} strategyId={record.strategyId} disabled={saving || conflict}/>
        : field.type === 'select' ? <select {...common}>{value && !field.options.includes(value) && <option value={value}>Current: {words(value)}</option>}{field.options.map((option) => <option key={option} value={option}>{field.optionLabels?.[option] || words(option)}</option>)}</select>
          : field.type === 'checkbox' ? <input type="checkbox" checked={value} onChange={(event) => change(event.target.checked)}/>
            : field.type === 'list' || (field.type === 'text' && field.max > 1000) ? <textarea {...common} maxLength={field.type === 'list' ? 5000 : field.max} rows={3}/>
              : <input {...common} type={['date', 'datetime-local', 'number', 'url'].includes(field.type) ? field.type : 'text'} min={field.min} max={field.max && field.type === 'number' ? field.max : undefined} maxLength={field.type === 'text' || field.type === 'url' ? field.max : undefined} step={field.type === 'number' ? field.decimals === 0 ? '1' : '0.01' : undefined}/>}
        {field.type === 'list' && <small>One team per line.</small>}{field.type === 'url' && <small>Existing HTTP(S) evidence URL only. No file upload or document storage is configured by this panel.</small>}{field.type === 'datetime-local' && <small>Date/time in UTC.</small>}
      </label>;
    })}</div><div className="maintenance-actions"><button type="submit">{saving ? 'Saving…' : 'Save changes'}</button><button type="button" onClick={() => setEditing(false)}>Cancel edit</button></div></fieldset></form>}
    {archiveDialog && <form className="maintenance-confirm" aria-label={`${archiveDialog} confirmation`} onSubmit={(event) => { event.preventDefault(); send(archiveDialog); }}><p>{archiveDialog === 'archive' ? 'Archive this record? Its data and links are retained. Archive does not mean completed or cancelled.' : 'Restore this record? Archived parent records must also be restored before editing.'}</p>{archiveDialog === 'archive' && <label>Archive reason<textarea required maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving}/></label>}<div className="maintenance-actions"><button disabled={saving || conflict || (archiveDialog === 'archive' && !reason.trim())} type="submit">Confirm {archiveDialog}</button><button disabled={saving} type="button" onClick={() => setArchiveDialog(null)}>Cancel</button></div></form>}
  </article>;
}
export function RecordMaintenanceWorkspace({ rootKind, recordId, groups, enabled = false, compatibilityEndpoints = true, onChanged, heading }) {
  const [root, setRoot] = useState(null); const [lists, setLists] = useState({}); const [pages, setPages] = useState({}); const [loading, setLoading] = useState(false); const [error, setError] = useState(''); const [showArchived, setShowArchived] = useState(false); const [groupErrors, setGroupErrors] = useState({});
  const generation = useRef(0); const live = isLiveMaintenanceId(recordId);
  const groupsKey = JSON.stringify(groups);
  const loadGroup = useCallback(async (group, offset = 0, generationId = generation.current) => {
    try {
      const response = await api.get(`/maintenance/${group.kind}`, { params: { [group.filter]: recordId, offset, limit: 25 } });
      if (generationId !== generation.current) return;
      setLists((current) => ({ ...current, [group.kind]: offset ? [...(current[group.kind] || []), ...response.data.data] : response.data.data }));
      setPages((current) => ({ ...current, [group.kind]: response.data.pagination })); setGroupErrors((current) => ({ ...current, [group.kind]: '' }));
    } catch (failure) { if (generationId === generation.current) setGroupErrors((current) => ({ ...current, [group.kind]: failure.response?.data?.error || 'These records could not be loaded. Retry.' })); }
  }, [recordId]);
  const load = useCallback(async () => {
    if (!enabled || !live) return;
    const current = ++generation.current; setLoading(true); setError(''); setRoot(null); setLists({}); setPages({}); setGroupErrors({});
    try {
      const response = await api.get(`/maintenance/${rootKind}/${recordId}`);
      if (current !== generation.current) return;
      setRoot(response.data.data);
      await Promise.all(JSON.parse(groupsKey).map((group) => loadGroup(group, 0, current)));
    } catch (failure) { if (current === generation.current) setError(failure.response?.data?.error || 'Maintenance is unavailable. Verify your session and ask an administrator to check migration 015.'); }
    finally { if (current === generation.current) setLoading(false); }
  }, [enabled, live, rootKind, recordId, groupsKey, loadGroup]);
  useEffect(() => { load(); return () => { generation.current += 1; }; }, [load]);
  const saved = (kind) => (record) => {
    if (kind === rootKind) setRoot(record); else setLists((current) => ({ ...current, [kind]: (current[kind] || []).map((item) => item.id === record.id ? record : item) }));
    if (onChanged) Promise.resolve(onChanged(record, kind)).catch(() => setError('The maintenance change was saved, but the surrounding view could not refresh. Refresh that view before continuing.'));
  };
  if (!recordId) return null;
  return <section className="record-maintenance-panel" aria-label={heading}><div className="maintenance-heading"><div><h3>{heading}</h3><p>Edit and assign existing records, record delivery completion, or archive and restore without deletion.</p></div>{enabled && live && <button type="button" disabled={loading} onClick={load}>{loading ? 'Loading…' : 'Refresh maintenance'}</button>}</div>
    {!enabled ? <p role="status">Record maintenance is disabled until the maintenance router, guarded existing endpoints and migration 015 are configured.</p> : !live ? <p role="status">Maintenance is available only for a live Council record, not a sample or demonstration fallback.</p> : <>
      {error && <p role="alert" className="maintenance-error">{error}</p>}{loading && <p role="status">Loading current records and permissions…</p>}
      {root && <MaintenanceRecordEditor key={`${rootKind}-${root.id}`} record={root} onSaved={saved(rootKind)} compatibilityEndpoints={compatibilityEndpoints}/>}
      <label className="maintenance-archive-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)}/>Show archived supporting records</label>
      {groups.map((group) => {
        const all = lists[group.kind] || []; const rows = showArchived ? all : all.filter((record) => !record.maintenance.archivedAt);
        return <section className="maintenance-group" key={group.kind} aria-label={group.label}><h4>{group.label}</h4>{groupErrors[group.kind] && <p role="alert">{groupErrors[group.kind]} <button type="button" onClick={() => loadGroup(group)}>Retry {group.label.toLowerCase()}</button></p>}{!loading && !rows.length && !groupErrors[group.kind] && <p>No {showArchived ? '' : 'active '}records in this loaded page. Use the existing create controls to add records.</p>}
          {rows.map((record) => <MaintenanceRecordEditor key={`${group.kind}-${record.id}`} record={record} onSaved={saved(group.kind)} compatibilityEndpoints={compatibilityEndpoints}/>)}
          {pages[group.kind]?.hasMore && <button type="button" disabled={loading} onClick={() => loadGroup(group, pages[group.kind].nextOffset)}>Load more {group.label.toLowerCase()}</button>}
        </section>;
      })}
    </>}
  </section>;
}
