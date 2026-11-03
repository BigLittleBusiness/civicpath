// Deliberately dependency-free: reporting never serializes model instances wholesale.
export const REPORT_ROW_LIMIT = 2000;
export const REPORT_BYTE_LIMIT = 2 * 1024 * 1024;
export const EVIDENCE_DEFINITION = 'Percentage of active strategy actions with at least one recorded ActionEvidenceLink. Recorded does not mean verified, valid, complete or independently assured. Readiness scores and free-text evidence summaries are not evidence links.';
export const REPORT_BASIS = 'Live register at generation time, with included-in-report updates from the selected period. This is not a reconstruction of the register at period end. No formal review or approval is inferred.';
export const plain = (row) => row?.get ? row.get({ plain: true }) : row || {};
const text = (value, max = 12000) => typeof value === 'string' ? value.slice(0, max) : null;
// Source names are useful provenance, but URL/storage-style source values are not exportable.
const sourceName = (value) => typeof value !== 'string' ? null : /(?:[a-z][a-z0-9+.-]*:\/\/|\b(?:token|password|secret|signature|credential|api[_ -]?key)\s*[:=]|(?:^|\s)(?:\/|\\))/i.test(value) ? 'Source location or credential-style value omitted from export' : value.slice(0, 240);
const number = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? null : Number(value);
const date = (value) => value instanceof Date ? value.toISOString() : text(value, 40);
function pick(row, fields) {
  const source = plain(row); const result = {};
  for (const key of fields) {
    const value = source[key];
    result[key] = /At$|Date$|On$/.test(key) ? date(value) : ['amount', 'impact', 'likelihood'].includes(key) ? number(value) : text(value);
  }
  return result;
}
const rows = (input) => (Array.isArray(input) ? input : []).slice(0, REPORT_ROW_LIMIT);
const live = (row) => !plain(row).deletedAt;
const scoped = (input, organizationId, strategyId) => rows(input).filter((row) => live(row) && plain(row).organizationId === organizationId && plain(row).strategyId === strategyId).map(plain);

export function computeEvidenceCoverage(actions, evidence, organizationId) {
  const ids = new Set(actions.filter(live).map(plain).filter((a) => a.organizationId === organizationId && a.isActive !== false).map((a) => a.id));
  const links = evidence.filter(live).map(plain).filter((e) => e.organizationId === organizationId && ids.has(e.actionId));
  const covered = new Set(links.map((e) => e.actionId));
  return { evidenceCoverage: ids.size ? Math.round(100 * covered.size / ids.size) : 0, evidenceCoveredActions: covered.size, evidenceEligibleActions: ids.size, recordedEvidenceLinks: links.length, evidenceCoverageDefinition: EVIDENCE_DEFINITION };
}

export function buildReport({ organizationId, strategy, period, actions = [], statuses = [], focusAreas = [], updates = [], evidence = [], dependencies = [], milestones = [], decisions = [], risks = [], measures = [], funding = [], generatedAt = new Date().toISOString() }) {
  for (const source of [actions, statuses, focusAreas, updates, evidence, dependencies, milestones, decisions, risks, measures, funding]) if (source.length > REPORT_ROW_LIMIT) throw Object.assign(new Error('Report source exceeds the safe row limit; no partial report was generated.'), { status: 422 });
  strategy = plain(strategy); period = plain(period);
  if (strategy.organizationId !== organizationId || period.organizationId !== organizationId || period.strategyId !== strategy.id) throw Object.assign(new Error('Report not found.'), { status: 404 });
  const active = scoped(actions, organizationId, strategy.id).filter((a) => a.isActive !== false);
  const ids = new Set(active.map((a) => a.id));
  const related = (input) => rows(input).filter(live).map(plain).filter((r) => r.organizationId === organizationId && ids.has(r.actionId));
  const periodUpdates = related(updates).filter((u) => u.reportingPeriodId === period.id);
  // Defensive deduplication: coverage counts actions, not versions or update rows.
  const included = [...new Map(periodUpdates.filter((u) => u.workflowStatus === 'included_in_report').sort((a, b) => String(a.submittedAt).localeCompare(String(b.submittedAt))).map((u) => [u.actionId, u])).values()];
  const evidenceRows = related(evidence);
  const definitions = scoped(statuses, organizationId, strategy.id).filter((s) => s.isActive !== false);
  const statusMix = definitions.map((s) => ({ code: text(s.code, 60), label: text(s.label, 100), category: text(s.category, 60), count: active.filter((a) => a.status === s.code).length }));
  const known = new Set(definitions.map((s) => s.code));
  const unknownCount = active.filter((a) => !known.has(a.status)).length;
  if (unknownCount) statusMix.push({ code: 'unmapped', label: 'Unmapped status', category: 'unknown', count: unknownCount });
  const categoryCount = (categories) => statusMix.filter((s) => categories.includes(s.category)).reduce((sum, s) => sum + s.count, 0);
  const openDependencies = scoped(dependencies, organizationId, strategy.id).filter((d) => ['open', 'progressing'].includes(d.status));
  const pendingDecisions = scoped(decisions, organizationId, strategy.id).filter((d) => ['draft', 'required', 'deferred'].includes(d.decisionStatus) && (!d.actionId || ids.has(d.actionId)));
  const openRisks = scoped(risks, organizationId, strategy.id).filter((r) => !['resolved', 'accepted'].includes(r.status) && (!r.actionId || ids.has(r.actionId)));
  const today = generatedAt.slice(0, 10);
  const overdue = related(milestones).filter((m) => m.status !== 'complete' && m.dueDate && m.dueDate < today);
  const fundingRows = related(funding).filter((f) => f.status !== 'not_proceeding');
  // Never add AUD and NZD together or describe identified funding as secured.
  const fundingByCurrency = {};
  for (const f of fundingRows) {
    if (!['AUD', 'NZD'].includes(f.currencyCode)) continue;
    const entry = fundingByCurrency[f.currencyCode] ||= { recorded: 0, secured: 0 };
    const amount = Math.max(0, number(f.amount) || 0);
    entry.recorded += amount; if (f.status === 'secured') entry.secured += amount;
  }
  const summary = { totalActions: active.length, onTrack: categoryCount(['on_track']), completed: categoryCount(['complete']), attentionRequired: categoryCount(['attention', 'off_track']), unknownStatusActions: unknownCount, criticalDependencies: openDependencies.filter((d) => d.severity === 'critical').length, overdueMilestones: overdue.length, decisionsRequired: pendingDecisions.length, includedUpdates: included.length, updatesAwaitingInclusion: new Set(periodUpdates.filter((u) => u.workflowStatus !== 'included_in_report').map((u) => u.actionId)).size, updateCoverage: active.length ? Math.round(100 * included.length / active.length) : 0, ...computeEvidenceCoverage(active, evidenceRows, organizationId), fundingByCurrency };
  const report = {
    schemaVersion: 1, generatedAt, basis: REPORT_BASIS,
    strategy: pick(strategy, ['id', 'name', 'reference', 'version', 'startDate', 'endDate', 'status']),
    reportingPeriod: pick(period, ['id', 'label', 'financialYear', 'quarter', 'startsOn', 'endsOn', 'status']),
    summary, statusMix,
    focusSummary: scoped(focusAreas, organizationId, strategy.id).map((f) => ({ ...pick(f, ['id', 'code', 'title']), actions: active.filter((a) => a.focusAreaId === f.id).length })),
    actions: active.map((a) => ({ ...pick(a, ['id', 'actionCode', 'title', 'focusAreaId', 'status', 'targetDate', 'nextStep', 'nextDecision', 'nextDecisionDueAt', 'reportingPriority']), recordedEvidenceLinks: evidenceRows.filter((e) => e.actionId === a.id).length, includedUpdate: included.some((u) => u.actionId === a.id) })),
    updates: included.map((u) => pick(u, ['id', 'actionId', 'status', 'movement', 'achievements', 'evidenceSummary', 'riskSummary', 'decisionsRequired', 'nextQuarterCommitments', 'submittedAt'])),
    evidence: evidenceRows.map((e) => ({ ...pick(e, ['id', 'actionId', 'title', 'evidenceType']), recordedAt: date(e.createdAt), source: sourceName(e.source), provenance: 'ActionEvidenceLink / recorded, not independently verified' })),
    dependencies: openDependencies.map((d) => pick(d, ['id', 'dependencyType', 'severity', 'status', 'dueDate', 'detail'])),
    overdueMilestones: overdue.map((m) => pick(m, ['id', 'actionId', 'title', 'dueDate', 'status', 'varianceExplanation'])),
    decisions: pendingDecisions.map((d) => pick(d, ['id', 'actionId', 'title', 'decisionStatus', 'dueDate', 'recommendation'])),
    risks: openRisks.map((r) => pick(r, ['id', 'actionId', 'title', 'issueType', 'status', 'impact', 'likelihood', 'mitigation', 'dueDate'])),
    measures: related(measures).map((m) => pick(m, ['id', 'actionId', 'name', 'unit', 'baselineValue', 'targetValue', 'currentValue', 'lastMeasuredAt'])),
    funding: fundingRows.map((f) => pick(f, ['id', 'actionId', 'sourceName', 'sourceType', 'amount', 'currencyCode', 'status', 'dueDate'])),
    narrative: `This draft covers ${summary.totalActions} active strategy actions. ${summary.onTrack} are on track, ${summary.attentionRequired} need attention and ${summary.completed} are complete. ${summary.includedUpdates} actions have updates included for ${period.label}. ${summary.evidenceCoveredActions} actions have recorded evidence links. ${summary.decisionsRequired} decision items and ${summary.criticalDependencies} critical dependencies remain open. Recorded information is not independent assurance or formal approval.`,
  };
  if (Buffer.byteLength(JSON.stringify(report), 'utf8') > REPORT_BYTE_LIMIT) throw Object.assign(new Error('Report exceeds the 2 MiB safe export limit. Reduce source narrative size before generating a snapshot.'), { status: 422 });
  return report;
}

// Re-allowlist every historical read, including snapshots produced by the legacy writer.
// Historical metrics are retained, never recomputed using today's source records.
export function serializeReport(input) {
  const r = plain(input);
  for (const key of ['actions', 'updates', 'evidence', 'dependencies', 'overdueMilestones', 'decisions', 'risks', 'measures', 'funding', 'statusMix', 'focusSummary']) if (Array.isArray(r[key]) && r[key].length > REPORT_ROW_LIMIT) throw Object.assign(new Error('Historical report exceeds the safe row limit; no partial export was generated.'), { status: 422 });
  const safeRows = (key, fields) => rows(r[key]).map((row) => pick(row, fields));
  const sourceSummary = plain(r.summary); const summary = {};
  for (const key of ['totalActions', 'onTrack', 'completed', 'attentionRequired', 'unknownStatusActions', 'criticalDependencies', 'overdueMilestones', 'decisionsRequired', 'includedUpdates', 'updatesAwaitingInclusion', 'updateCoverage', 'evidenceCoveredActions', 'evidenceEligibleActions', 'recordedEvidenceLinks']) summary[key] = number(sourceSummary[key]);
  const metricKnown = r.schemaVersion === 1 && sourceSummary.evidenceCoverageDefinition === EVIDENCE_DEFINITION;
  summary.evidenceCoverage = metricKnown ? number(sourceSummary.evidenceCoverage) : null;
  summary.evidenceCoverageDefinition = metricKnown ? EVIDENCE_DEFINITION : 'Legacy snapshot: evidence-link coverage was not recorded with the current definition. The former readiness-based metric is intentionally not presented as evidence coverage.';
  summary.fundingByCurrency = {};
  for (const code of ['AUD', 'NZD']) if (sourceSummary.fundingByCurrency?.[code]) summary.fundingByCurrency[code] = { recorded: number(sourceSummary.fundingByCurrency[code].recorded), secured: number(sourceSummary.fundingByCurrency[code].secured) };
  const result = {
    schemaVersion: r.schemaVersion === 1 ? 1 : 0, generatedAt: date(r.generatedAt), basis: REPORT_BASIS,
    strategy: pick(r.strategy, ['id', 'name', 'reference', 'version', 'startDate', 'endDate', 'status']), reportingPeriod: pick(r.reportingPeriod, ['id', 'label', 'financialYear', 'quarter', 'startsOn', 'endsOn', 'status']), summary,
    statusMix: rows(r.statusMix).map((s) => ({ ...pick(s, ['code', 'label', 'category']), count: number(s.count) })),
    focusSummary: rows(r.focusSummary).map((f) => ({ ...pick(f, ['id', 'code', 'title']), actions: number(f.actions) })),
    actions: rows(r.actions).map((a) => ({ ...pick(a, ['id', 'actionCode', 'title', 'focusAreaId', 'status', 'targetDate', 'nextStep', 'nextDecision', 'nextDecisionDueAt', 'reportingPriority']), recordedEvidenceLinks: metricKnown ? number(a.recordedEvidenceLinks) : null, includedUpdate: typeof a.includedUpdate === 'boolean' ? a.includedUpdate : null })),
    updates: safeRows('updates', ['id', 'actionId', 'status', 'movement', 'achievements', 'evidenceSummary', 'riskSummary', 'decisionsRequired', 'nextQuarterCommitments', 'submittedAt']),
    evidence: rows(r.evidence).map((e) => ({ ...pick(e, ['id', 'actionId', 'title', 'evidenceType', 'recordedAt']), source: sourceName(e.source), provenance: 'ActionEvidenceLink / recorded, not independently verified' })), dependencies: safeRows('dependencies', ['id', 'dependencyType', 'severity', 'status', 'dueDate', 'detail']), overdueMilestones: safeRows('overdueMilestones', ['id', 'actionId', 'title', 'dueDate', 'status', 'varianceExplanation']), decisions: safeRows('decisions', ['id', 'actionId', 'title', 'decisionStatus', 'dueDate', 'recommendation']), risks: safeRows('risks', ['id', 'actionId', 'title', 'issueType', 'status', 'impact', 'likelihood', 'mitigation', 'dueDate']), measures: safeRows('measures', ['id', 'actionId', 'name', 'unit', 'baselineValue', 'targetValue', 'currentValue', 'lastMeasuredAt']), funding: safeRows('funding', ['id', 'actionId', 'sourceName', 'sourceType', 'amount', 'currencyCode', 'status', 'dueDate']), narrative: text(r.narrative, 30000),
  };
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > REPORT_BYTE_LIMIT) throw Object.assign(new Error('Historical report exceeds the 2 MiB safe export limit.'), { status: 422 });
  return result;
}
export function serializeSnapshot(record, detail = false) {
  const s = plain(record);
  const result = { id: text(s.id, 40), strategyId: text(s.strategyId, 40), reportingPeriodId: text(s.reportingPeriodId, 40), version: number(s.version), reportType: ['quarterly', 'annual'].includes(s.reportType) ? s.reportType : 'quarterly', status: ['draft', 'reviewed', 'approved'].includes(s.status) ? s.status : 'draft', approvalStatus: 'not_certified', createdAt: date(s.createdAt), assurance: 'Immutable recorded snapshot; no formal review or approval is certified by this report. Legacy stored workflow labels are not assurance.' };
  if (detail) result.content = serializeReport(s.content);
  return result;
}
export const escapeHtml = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function csvCell(value) {
  let s = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+\-@]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export function reportCsv(report, snapshot = null) {
  const r = serializeReport(report); const lines = [['section', 'reference', 'title / metric', 'status / value', 'due / date', 'detail']];
  if (snapshot) lines.push(['snapshot', snapshot.id, 'Version', snapshot.version, snapshot.createdAt, `Stored label: ${snapshot.status}; approval: not certified`]);
  lines.push(['report', r.strategy.id, r.strategy.name, r.reportingPeriod.label, r.generatedAt, r.basis]);
  for (const [key, value] of Object.entries(r.summary)) if (typeof value !== 'object') lines.push(['summary', '', key, value, '', '']);
  for (const [currency, value] of Object.entries(r.summary.fundingByCurrency)) lines.push(['funding summary', currency, 'Recorded / secured', value.recorded, '', value.secured]);
  for (const a of r.actions) lines.push(['action', a.actionCode || a.id, a.title, a.status, a.targetDate, a.nextStep]);
  for (const [key, label] of [['updates', 'update'], ['dependencies', 'dependency'], ['overdueMilestones', 'overdue milestone'], ['decisions', 'decision'], ['risks', 'risk'], ['measures', 'measure'], ['funding', 'funding'], ['evidence', 'recorded evidence']]) for (const row of r[key]) lines.push([label, row.actionId || row.id, row.title || row.name || row.sourceName || row.dependencyType, row.status || row.decisionStatus || row.currentValue || row.evidenceType, row.dueDate || row.lastMeasuredAt || row.submittedAt || row.recordedAt, row.achievements || row.recommendation || row.mitigation || row.detail || row.source || (row.amount == null ? '' : `${row.currencyCode} ${row.amount}`)]);
  return '\uFEFF' + lines.map((line) => line.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
export function reportHtml(report, snapshot = null) {
  const r = serializeReport(report); const h = escapeHtml;
  const table = (title, records, columns) => `<section><h2>${h(title)}</h2>${records.length ? `<table><thead><tr>${columns.map(([label]) => `<th scope="col">${h(label)}</th>`).join('')}</tr></thead><tbody>${records.map((row) => `<tr>${columns.map(([, key]) => `<td>${h(row[key])}</td>`).join('')}</tr>`).join('')}</tbody></table>` : '<p>No records in this view.</p>'}</section>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(r.strategy.name)} — ${h(r.reportingPeriod.label)} — Recorded draft</title><style>html{color:#183432;background:#edf3f0;font:15px/1.55 system-ui,sans-serif}body{max-width:1050px;margin:32px auto;padding:40px;background:white}header{border-bottom:3px solid #176c57;padding-bottom:24px}h1{font:700 32px/1.2 system-ui;margin:8px 0}h2{font-size:20px;margin-top:30px;color:#176c57}.eyebrow{letter-spacing:.14em;text-transform:uppercase;font-size:12px}.notice{background:#eef5f1;border-left:4px solid #176c57;padding:14px}dl{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}dl div{padding:14px;border:1px solid #cbdcd4}dt{font-size:12px}dd{margin:0;font-size:25px;font-weight:700}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:9px;vertical-align:top;border-bottom:1px solid #ccdcd5;white-space:pre-wrap;overflow-wrap:anywhere}th{background:#eef5f1}section{margin:22px 0}footer{border-top:1px solid #ccdcd5;margin-top:30px;font-size:12px}button{padding:10px 16px;background:#176c57;color:#fff;border:0;border-radius:4px;cursor:pointer}button:focus-visible{outline:3px solid #b75e21;outline-offset:3px}@media(max-width:650px){body{margin:0;padding:18px}dl{grid-template-columns:repeat(2,1fr)}table{font-size:11px}}@page{size:A4 landscape;margin:16mm}@media print{html{background:white}body{max-width:none;margin:0;padding:0;font-size:10pt}.print-controls{display:none}h2{break-after:avoid}tr,dl div{break-inside:avoid}thead{display:table-header-group}table{font-size:9pt}th{background:#eee}footer{font-size:8pt}}</style></head><body><div class="print-controls"><button type="button" id="print-report">Print / Save as PDF</button><p>Choose your browser’s Save as PDF destination. Keep downloaded reports within your council’s information-handling policy.</p></div><header><p class="eyebrow">CivicPath / Strategy delivery / Recorded draft</p><h1>${h(r.strategy.name)}</h1><p>${h(r.reportingPeriod.label)} · ${h(r.reportingPeriod.startsOn)} – ${h(r.reportingPeriod.endsOn)}</p><p>${snapshot ? `Snapshot ${h(snapshot.id)} · Version ${h(snapshot.version)} · Captured ${h(snapshot.createdAt)} · Stored workflow label ${h(snapshot.status)} · Approval not certified` : `Live view generated ${h(r.generatedAt)}`}</p></header><p class="notice">${h(r.basis)}</p><dl>${[['Active actions', r.summary.totalActions], ['On track', r.summary.onTrack], ['Attention required', r.summary.attentionRequired], ['Recorded evidence coverage', r.summary.evidenceCoverage == null ? 'Not recorded' : `${r.summary.evidenceCoverage}%`]].map(([label, value]) => `<div><dt>${h(label)}</dt><dd>${h(value)}</dd></div>`).join('')}</dl><p>${h(r.summary.evidenceCoverageDefinition)}</p><section><h2>Officer discussion brief</h2><p>${h(r.narrative)}</p></section>${table('Summary metrics', Object.entries(r.summary).filter(([, value]) => typeof value !== 'object').map(([key, value]) => ({ key, value })), [['Metric', 'key'], ['Recorded value', 'value']])}${table('Status distribution', r.statusMix, [['Status', 'label'], ['Actions', 'count']])}${table('Focus areas', r.focusSummary, [['Code', 'code'], ['Focus', 'title'], ['Actions', 'actions']])}${table('Action register', r.actions, [['Code', 'actionCode'], ['Action', 'title'], ['Status', 'status'], ['Target', 'targetDate'], ['Next step', 'nextStep'], ['Evidence links', 'recordedEvidenceLinks']])}${table('Included period updates', r.updates, [['Action', 'actionId'], ['Movement', 'movement'], ['Achievements', 'achievements'], ['Evidence summary (not verification)', 'evidenceSummary'], ['Risks', 'riskSummary'], ['Decisions required', 'decisionsRequired'], ['Next commitment', 'nextQuarterCommitments'], ['Recorded', 'submittedAt']])}${table('Open dependencies', r.dependencies, [['Type', 'dependencyType'], ['Severity', 'severity'], ['Due', 'dueDate'], ['Detail', 'detail']])}${table('Overdue milestones at generation', r.overdueMilestones, [['Milestone', 'title'], ['Due', 'dueDate'], ['Variance', 'varianceExplanation']])}${table('Decisions for discussion', r.decisions, [['Decision', 'title'], ['Status', 'decisionStatus'], ['Due', 'dueDate'], ['Recommendation', 'recommendation']])}${table('Open risks and issues', r.risks, [['Title', 'title'], ['Status', 'status'], ['Impact', 'impact'], ['Likelihood', 'likelihood'], ['Mitigation', 'mitigation']])}${table('Measures (recorded values)', r.measures, [['Measure', 'name'], ['Unit', 'unit'], ['Baseline', 'baselineValue'], ['Target', 'targetValue'], ['Current', 'currentValue'], ['Measured', 'lastMeasuredAt']])}${table('Funding summary by currency', Object.entries(r.summary.fundingByCurrency).map(([currency, values]) => ({ currency, ...values })), [['Currency', 'currency'], ['Recorded positions', 'recorded'], ['Secured only', 'secured']])}${table('Funding positions (not commitments inferred)', r.funding, [['Source', 'sourceName'], ['Currency', 'currencyCode'], ['Amount', 'amount'], ['Position', 'status']])}${table('Recorded evidence links (no private URLs exported)', r.evidence, [['Action', 'actionId'], ['Title', 'title'], ['Type', 'evidenceType'], ['Recorded', 'recordedAt'], ['Source', 'source'], ['Provenance', 'provenance']])}<footer>Confidential council working report. No formal review, council resolution, approval or independent verification is certified. Private storage locations and attachment credentials are excluded.</footer><script>document.getElementById('print-report').addEventListener('click',function(){window.print()});</script></body></html>`;
}
