import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../features/AuthContext';
import { api } from '../lib/api';
import './ReportHistoryPanel.css';

const show = (value) => value === null || value === undefined || value === '' ? 'Not recorded' : String(value).replace(/_/g, ' ');
const timestamp = (value) => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Not recorded';
const reportError = (error, fallback) => error.response?.status === 404 ? 'Reporting is unavailable or this council record no longer exists. Ask an administrator to check reporting integration and access.' : error.response?.data?.error || fallback;

function RecordTable({ title, records = [], columns }) {
  return <section className="report-section"><h4>{title}</h4>{records.length ? <div className="report-table-scroll" role="region" aria-label={title} tabIndex={0}><table><caption className="report-sr-only">{title}</caption><thead><tr>{columns.map(([label, key]) => <th scope="col" key={key}>{label}</th>)}</tr></thead><tbody>{records.map((row, index) => <tr key={row.id || row.code || index}>{columns.map(([, key]) => <td key={key}>{show(row[key])}</td>)}</tr>)}</tbody></table></div> : <p>No records in this view.</p>}</section>;
}

export function ReportDocument({ report, snapshot }) {
  if (!report) return null;
  const summary = report.summary || {};
  const actionLabels = Object.fromEntries((report.actions || []).map((a) => [a.id, `${a.actionCode ? `${a.actionCode} · ` : ''}${a.title}`]));
  const linked = (rows) => (rows || []).map((r) => ({ ...r, actionLabel: actionLabels[r.actionId] || (r.actionId ? 'Unavailable action' : 'Strategy-wide') }));
  return <article className="report-document report-print-target" aria-label="Strategy report document">
    <header className="report-document-header"><p className="report-eyebrow">CivicPath / Strategy delivery / Recorded draft</p><h3>{report.strategy?.name || 'Strategy report'}</h3><p>{report.reportingPeriod?.label} · {show(report.reportingPeriod?.startsOn)} – {show(report.reportingPeriod?.endsOn)}</p><p>{snapshot ? `Snapshot version ${snapshot.version} · Captured ${timestamp(snapshot.createdAt)}` : `Live view · Generated ${timestamp(report.generatedAt)}`}</p>{snapshot && <><p className="report-reference">Snapshot reference: {snapshot.id} · Stored workflow label: {show(snapshot.status)} · Approval: not certified</p><p>{snapshot.assurance}</p></>}</header>
    <p className="report-notice">{report.basis || 'Live register at generation time with selected-period included updates; not a reconstruction of the register at period end. No formal approval or independent verification is inferred.'}</p>
    <dl className="report-metrics">{[['Active actions', summary.totalActions], ['On track', summary.onTrack], ['Attention required', summary.attentionRequired], ['Recorded evidence coverage', summary.evidenceCoverage == null ? 'Not recorded' : `${summary.evidenceCoverage}%`]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{show(value)}</dd></div>)}</dl>
    <p className="report-definition">{summary.evidenceCoverageDefinition || 'Recorded evidence does not mean verified. Legacy snapshots may not have recorded evidence-link coverage.'}</p>
    <section className="report-section"><h4>Officer discussion brief</h4><p className="report-narrative">{report.narrative || 'No narrative recorded.'}</p></section>
    <RecordTable title="Summary metrics" records={Object.entries(summary).filter(([key, value]) => key !== 'evidenceCoverageDefinition' && typeof value !== 'object').map(([key, value]) => ({ id: key, metric: key.replace(/([A-Z])/g, ' $1'), value }))} columns={[["Metric", 'metric'], ['Recorded value', 'value']]}/>
    <RecordTable title="Status distribution" records={report.statusMix} columns={[["Status", 'label'], ['Actions', 'count']]}/>
    <RecordTable title="Focus areas" records={report.focusSummary} columns={[["Code", 'code'], ['Focus', 'title'], ['Actions', 'actions']]}/>
    <RecordTable title="Action register" records={report.actions} columns={[["Code", 'actionCode'], ['Action', 'title'], ['Status', 'status'], ['Target date', 'targetDate'], ['Next step', 'nextStep'], ['Recorded evidence links', 'recordedEvidenceLinks']]}/>
    <RecordTable title="Included period updates" records={linked(report.updates)} columns={[["Action", 'actionLabel'], ['Movement', 'movement'], ['Achievements', 'achievements'], ['Evidence summary (not verification)', 'evidenceSummary'], ['Risks', 'riskSummary'], ['Decisions', 'decisionsRequired'], ['Next commitment', 'nextQuarterCommitments'], ['Recorded update', 'submittedAt']]}/>
    <RecordTable title="Open dependencies" records={report.dependencies} columns={[["Type", 'dependencyType'], ['Severity', 'severity'], ['Status', 'status'], ['Due', 'dueDate'], ['Detail', 'detail']]}/>
    <RecordTable title="Overdue milestones at generation" records={linked(report.overdueMilestones)} columns={[["Action", 'actionLabel'], ['Milestone', 'title'], ['Due', 'dueDate'], ['Variance', 'varianceExplanation']]}/>
    <RecordTable title="Decisions for discussion" records={linked(report.decisions)} columns={[["Action", 'actionLabel'], ['Decision', 'title'], ['Status', 'decisionStatus'], ['Due', 'dueDate'], ['Recommendation', 'recommendation']]}/>
    <RecordTable title="Open risks and issues" records={linked(report.risks)} columns={[["Action", 'actionLabel'], ['Title', 'title'], ['Status', 'status'], ['Impact', 'impact'], ['Likelihood', 'likelihood'], ['Mitigation', 'mitigation']]}/>
    <RecordTable title="Measures (recorded values)" records={linked(report.measures)} columns={[["Action", 'actionLabel'], ['Measure', 'name'], ['Unit', 'unit'], ['Baseline', 'baselineValue'], ['Target', 'targetValue'], ['Current', 'currentValue'], ['Measured', 'lastMeasuredAt']]}/>
    <RecordTable title="Funding summary by currency" records={Object.entries(summary.fundingByCurrency || {}).map(([currency, values]) => ({ id: currency, currency, ...values }))} columns={[["Currency", 'currency'], ['Recorded positions', 'recorded'], ['Secured positions only', 'secured']]}/>
    <RecordTable title="Funding positions (no commitments inferred)" records={linked(report.funding)} columns={[["Action", 'actionLabel'], ['Source', 'sourceName'], ['Currency', 'currencyCode'], ['Amount', 'amount'], ['Position', 'status']]}/>
    <RecordTable title="Recorded evidence links (private URLs excluded)" records={linked(report.evidence)} columns={[["Action", 'actionLabel'], ['Title', 'title'], ['Type', 'evidenceType'], ['Recorded date', 'recordedAt'], ['Source name', 'source'], ['Provenance', 'provenance']]}/>
    <footer className="report-document-footer">Confidential council working report. No formal review, council resolution, approval or independent assurance is certified. Private attachment URLs, storage locations and credentials are excluded. Handle exports under your council’s information-handling policy.</footer>
  </article>;
}

export function ReportHistoryPanel({ strategyId, periodId, refreshKey = 0, onSnapshotCreated, apiClient = api }) {
  const { user } = useAuth();
  const canCreate = ['org_admin', 'portfolio_manager'].includes(user?.role);
  const [live, setLive] = useState(null); const [history, setHistory] = useState([]); const [pagination, setPagination] = useState(null); const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false); const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [historyError, setHistoryError] = useState(''); const [notice, setNotice] = useState('');
  const generation = useRef(0); const previewRef = useRef(null); const operation = useRef(false);
  const load = useCallback(async (signal, key) => {
    setLoading(true); setLive(null); setHistory([]); setSelected(null); setError(''); setHistoryError(''); setPagination(null); setNotice('');
    const results = await Promise.allSettled([apiClient.get(`/reports/periods/${periodId}`, { signal }), apiClient.get(`/reports/periods/${periodId}/snapshots`, { signal, params: { limit: 20 } })]);
    if (generation.current !== key || signal.aborted) return;
    if (results[0].status === 'fulfilled') setLive(results[0].value.data.data); else setError(reportError(results[0].reason, 'The report could not be loaded. Retry or contact your administrator.'));
    if (results[1].status === 'fulfilled') { setHistory(results[1].value.data.data || []); setPagination(results[1].value.data.pagination); } else setHistoryError(reportError(results[1].reason, 'Snapshot history could not be loaded.'));
    setLoading(false);
  }, [apiClient, periodId]);
  useEffect(() => {
    const counter = generation; const key = ++counter.current; const controller = new AbortController(); setBusy(''); operation.current = false;
    if (strategyId && periodId) load(controller.signal, key); else { setLive(null); setHistory([]); setSelected(null); setLoading(false); }
    return () => { ++counter.current; controller.abort(); };
  }, [strategyId, periodId, refreshKey, load]);
  const retry = () => { const controller = new AbortController(); load(controller.signal, ++generation.current); };
  const run = async (kind, request, success) => {
    if (operation.current) return;
    operation.current = true; const key = generation.current; setBusy(kind); setError(''); setNotice('');
    try { const result = await request(); if (generation.current === key) success(result); }
    catch (err) { if (generation.current === key) setError(reportError(err, 'The report action failed. Retry or contact your administrator.')); }
    finally { if (generation.current === key) { operation.current = false; setBusy(''); } }
  };
  const create = () => run('create', async () => {
    const response = await apiClient.post(`/reports/periods/${periodId}/snapshots`, { status: 'draft' });
    // The save succeeded even if history refresh fails: never encourage a duplicate retry.
    try { response.historyPage = (await apiClient.get(`/reports/periods/${periodId}/snapshots`, { params: { limit: 20 } })).data; } catch { response.historyPage = null; }
    return response;
  }, (response) => {
    const snapshot = response.data.data; setSelected(snapshot);
    if (response.historyPage) { setHistory(response.historyPage.data); setPagination(response.historyPage.pagination); setHistoryError(''); }
    else { setHistory((current) => [snapshot, ...current.filter((s) => s.id !== snapshot.id)]); setHistoryError('Snapshot saved, but history refresh failed. Refresh history to see the complete page.'); }
    setNotice(`Recorded draft snapshot version ${snapshot.version} saved. This is not formal approval.`); onSnapshotCreated?.(snapshot);
  });
  const read = (snapshotId) => run('read', () => apiClient.get(`/reports/snapshots/${snapshotId}`), (response) => { setSelected(response.data.data); previewRef.current?.focus(); });
  const more = () => run('history', () => apiClient.get(`/reports/periods/${periodId}/snapshots`, { params: { limit: 20, beforeVersion: pagination.nextBeforeVersion } }), (response) => { setHistory((current) => [...new Map([...current, ...response.data.data].map((s) => [s.id, s])).values()]); setPagination(response.data.pagination); });
  const download = (format) => {
    if (!selected?.id) return;
    run('download', () => apiClient.get(`/reports/snapshots/${selected.id}/download`, { params: { format }, responseType: 'blob' }), (response) => {
      const url = URL.createObjectURL(response.data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `civicpath-report-${selected.id}-v${selected.version}.${format}`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(format === 'html' ? 'HTML downloaded. Open it locally and choose Print / Save as PDF. No external resources are loaded.' : `${format.toUpperCase()} report downloaded.`);
    });
  };
  const print = () => { document.body.classList.add('civicpath-report-print'); try { window.print(); } finally { document.body.classList.remove('civicpath-report-print'); } };
  const report = selected?.content || live;
  return <section className="report-history-panel" aria-label="Reporting and snapshot history">
    <div className="report-panel-heading"><div><p className="report-eyebrow">Reporting workspace</p><h2>Report view & snapshot history</h2><p>Explore a live period view or read an immutable recorded draft. Evidence coverage means linked records, not verification.</p></div></div>
    {!strategyId || !periodId ? <p className="report-empty">Choose a strategy and reporting period to view its report. If no periods exist, an organisation administrator or portfolio manager must create one in Strategy Delivery.</p> : <>
      <div className="report-toolbar"><button type="button" className="secondary-button" onClick={retry} disabled={loading || !!busy}>Refresh report & history</button>{canCreate ? <button type="button" className="primary-button" onClick={create} disabled={loading || !!busy || !live}>{busy === 'create' ? 'Saving recorded draft…' : 'Save recorded draft snapshot'}</button> : <p>Executive access is read-only. Administrators and portfolio managers can save snapshots.</p>}</div>
      {loading && <p role="status">Loading live report and snapshot history…</p>}{error && <p className="report-error" role="alert">{error}</p>}{notice && <p className="report-success" role="status">{notice}</p>}
      <div className="report-workspace-grid"><aside className="report-history-list" aria-label="Snapshot history"><h3>Snapshot history</h3><p>Newest versions first. Saved content never changes.</p>{historyError && <p className="report-error" role="alert">{historyError}</p>}<button type="button" className="report-history-item" onClick={() => { setSelected(null); setError(''); }} disabled={!!busy || !live} aria-pressed={!selected}>Live report <span>Current register / selected-period updates</span></button>{history.map((snapshot) => <button className="report-history-item" type="button" key={snapshot.id} disabled={!!busy} onClick={() => read(snapshot.id)} aria-pressed={selected?.id === snapshot.id}>Version {snapshot.version} · {snapshot.status === 'draft' ? 'Recorded draft' : `Legacy ${show(snapshot.status)} label (not certified)`}<span>{timestamp(snapshot.createdAt)}</span></button>)}{!loading && !history.length && !historyError && <p>No snapshots yet. The live view is available without saving.</p>}{pagination?.hasMore && <button type="button" className="secondary-button" onClick={more} disabled={!!busy}>{busy === 'history' ? 'Loading…' : 'Load older snapshots'}</button>}</aside>
      <div className="report-preview" ref={previewRef} tabIndex={-1} aria-label="Report preview"><div className="report-preview-toolbar">{report && <button className="secondary-button" type="button" onClick={print} disabled={!!busy}>Print / Save as PDF</button>}{selected && ['json', 'csv', 'html'].map((format) => <button key={format} className="secondary-button" type="button" onClick={() => download(format)} disabled={!!busy}>Download {format.toUpperCase()}</button>)}</div>{report ? <ReportDocument report={report} snapshot={selected}/> : !loading && <p className="report-empty">No report is available. Check the reporting period and retry. No demonstration data is substituted.</p>}</div></div>
    </>}
  </section>;
}
export default ReportHistoryPanel;
