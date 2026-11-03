import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createReportSnapshotController } from '../src/controllers/reportSnapshotController.js';
import { buildReport, serializeReport, serializeSnapshot, computeEvidenceCoverage, reportHtml, reportCsv, csvCell, EVIDENCE_DEFINITION, REPORT_ROW_LIMIT } from '../src/services/reportMetrics.js';

const org = '10000000-0000-4000-8000-000000000001';
const other = '20000000-0000-4000-8000-000000000001';
const userId = '30000000-0000-4000-8000-000000000001';
const strategyId = '40000000-0000-4000-8000-000000000001';
const periodId = '50000000-0000-4000-8000-000000000001';
const actionId = '60000000-0000-4000-8000-000000000001';
const strategy = { id: strategyId, organizationId: org, name: 'Real council strategy', status: 'active' };
const period = { id: periodId, organizationId: org, strategyId, label: '2026–27 Q1', startsOn: '2026-07-01', endsOn: '2026-09-30', status: 'locked' };
const action = { id: actionId, organizationId: org, strategyId, actionCode: 'A1', title: 'Deliver housing study', status: 'on_track', isActive: true, readinessScore: 100 };
const makeReport = (title = action.title) => buildReport({ organizationId: org, strategy, period, actions: [{ ...action, title }], statuses: [{ organizationId: org, strategyId, code: 'on_track', category: 'on_track', label: 'On track' }], generatedAt: '2026-10-01T12:00:00.000Z' });
function fixture() {
  const state = { snapshots: [], audits: [], sourceTitle: action.title, auditFail: false, locks: 0, calls: 0, next: 1 };
  let pending = Promise.resolve();
  const repository = {
    async strategy(tenant, target) { state.calls++; return tenant === org && target === strategyId ? strategy : null; },
    async period(tenant, target, tx, lock) { state.calls++; if (lock) { assert.ok(tx); state.locks++; } return tenant === org && target === periodId ? period : null; },
    async strategies(tenant, limit, offset) { state.calls++; return tenant === org ? [strategy].slice(offset, offset + limit) : []; },
    async periods(tenant, target, limit, offset) { return tenant === org && target === strategyId ? [period].slice(offset, offset + limit) : []; },
    async report(tenant, scope, tx) { assert.equal(tenant, org); assert.ok(tx); assert.equal(scope.period.id, periodId); return makeReport(state.sourceTitle); },
    async maxVersion(tenant, scope, tx) { assert.ok(tx); return Math.max(0, ...state.snapshots.filter((s) => s.organizationId === tenant && s.reportingPeriodId === scope.id).map((s) => s.version)); },
    async createSnapshot(values, tx) { assert.ok(tx); const row = { ...structuredClone(values), id: `70000000-0000-4000-8000-${String(state.next++).padStart(12, '0')}`, createdAt: '2026-10-01T12:00:00.000Z' }; state.snapshots.push(row); return row; },
    async snapshot(tenant, target) { return state.snapshots.find((s) => s.organizationId === tenant && s.id === target) || null; },
    async snapshots(tenant, scope, limit, before) { return state.snapshots.filter((s) => s.organizationId === tenant && s.strategyId === scope.strategyId && s.reportingPeriodId === scope.id && (!before || s.version < before)).sort((a, b) => b.version - a.version).slice(0, limit); },
  };
  const controller = createReportSnapshotController({ repository,
    authorizeActor: async (req) => req.actor || { id: req.auth.sub, organizationId: req.auth.organizationId, role: req.auth.role, status: 'active' },
    transaction: async (fn) => { const predecessor = pending; let unlock; pending = new Promise((resolve) => { unlock = resolve; }); await predecessor; const saved = structuredClone({ snapshots: state.snapshots, audits: state.audits }); try { return await fn({ LOCK: { UPDATE: 'UPDATE' } }); } catch (e) { state.snapshots = saved.snapshots; state.audits = saved.audits; throw e; } finally { unlock(); } },
    audit: async (_req, details) => { assert.ok(details.transaction); if (state.auditFail) throw new Error('Injected dependent audit failure'); state.audits.push(details.metadata); },
  });
  const req = (role = 'org_admin', tenant = org) => ({ auth: { sub: userId, role, organizationId: tenant }, tenant: { organizationId: tenant }, params: { periodId, strategyId }, query: {}, body: { status: 'draft' } });
  async function call(method, request = req()) { const res = { statusCode: 200, headers: {}, set(k, v) { this.headers[k] = v; return this; }, type(t) { this.headers['Content-Type'] = t; return this; }, status(s) { this.statusCode = s; return this; }, json(data) { this.body = data; return this; }, send(data) { this.body = data; return this; } }; await controller[method](request, res, (e) => { res.error = e; }); return res; }
  return { state, req, call };
}

test('integration: manager creates draft, executive lists/reads/downloads and old snapshot survives live source edits', async () => {
  const f = fixture();
  assert.equal((await f.call('listStrategies')).body.data[0].id, strategyId);
  assert.equal((await f.call('listPeriods')).body.data[0].id, periodId);
  const first = await f.call('createSnapshot', f.req('portfolio_manager'));
  assert.equal(first.statusCode, 201); assert.equal(first.body.data.version, 1); assert.equal(first.body.data.status, 'draft'); assert.equal(first.body.data.approvalStatus, 'not_certified');
  assert.equal(f.state.locks, 1); assert.equal(f.state.audits.length, 1);
  f.state.sourceTitle = 'Changed after first report';
  const second = await f.call('createSnapshot'); assert.equal(second.body.data.version, 2);
  const r = f.req('executive'); r.params.snapshotId = first.body.data.id;
  assert.equal((await f.call('getSnapshot', r)).body.data.content.actions[0].title, action.title);
  assert.equal((await f.call('getLiveReport', f.req('executive'))).body.data.actions[0].title, f.state.sourceTitle);
  const list = await f.call('listSnapshots', { ...f.req('executive'), query: { limit: '1' } });
  assert.deepEqual(list.body.data.map((s) => s.version), [2]); assert.equal(list.body.pagination.hasMore, true); assert.equal(list.body.pagination.nextBeforeVersion, 2); assert.equal('content' in list.body.data[0], false);
  const older = await f.call('listSnapshots', { ...f.req('executive'), query: { limit: '1', beforeVersion: '2' } }); assert.equal(older.body.data[0].version, 1);
  for (const format of ['json', 'csv', 'html']) { r.query = { format }; const download = await f.call('downloadSnapshot', r); assert.equal(download.statusCode, 200); assert.match(download.headers['Content-Disposition'], new RegExp(`v1\\.${format}`)); assert.equal(download.headers['Cache-Control'], 'no-store'); assert.match(download.body, /Deliver housing study/); assert.doesNotMatch(download.body, /Changed after first report/); }
});

test('integration: executive is read-only; contributor and platform admin cannot read or write reports', async () => {
  const f = fixture();
  for (const role of ['executive', 'contributor', 'platform_admin']) assert.equal((await f.call('createSnapshot', f.req(role))).statusCode, 403);
  for (const role of ['contributor', 'platform_admin']) for (const method of ['listStrategies', 'listPeriods', 'getLiveReport', 'listSnapshots', 'getSnapshot', 'downloadSnapshot']) assert.equal((await f.call(method, f.req(role))).statusCode, 403);
  assert.equal(f.state.snapshots.length, 0);
});

test('integration: unauthenticated, stale persisted role, disabled identity and forged tenant are rejected', async () => {
  const f = fixture(); assert.equal((await f.call('getLiveReport', { ...f.req(), auth: null })).statusCode, 401);
  const stale = f.req(); stale.actor = { id: userId, organizationId: org, status: 'active', role: 'executive' }; assert.equal((await f.call('createSnapshot', stale)).statusCode, 403);
  stale.actor.status = 'disabled'; assert.equal((await f.call('getLiveReport', stale)).statusCode, 401);
  const forged = f.req(); forged.tenant.organizationId = other; assert.equal((await f.call('getLiveReport', forged)).statusCode, 403); assert.equal(f.state.calls, 0);
});

test('integration: cross-tenant period/strategy/snapshot read and download never reveal another council', async () => {
  const f = fixture(); const saved = await f.call('createSnapshot'); const r = f.req('org_admin', other); r.params.snapshotId = saved.body.data.id;
  for (const method of ['listPeriods', 'getLiveReport', 'listSnapshots', 'createSnapshot', 'getSnapshot', 'downloadSnapshot']) { const out = await f.call(method, r); assert.equal(out.statusCode, 404); assert.doesNotMatch(JSON.stringify(out.body), /housing study/); }
  assert.equal(f.state.snapshots.length, 1);
});

test('integration: audit failure rolls back snapshot; concurrent saves allocate distinct monotonic versions', async () => {
  const f = fixture(); f.state.auditFail = true;
  const failed = await f.call('createSnapshot'); assert.equal(failed.statusCode, 503); assert.doesNotMatch(JSON.stringify(failed.body), /Injected dependent/); assert.equal(f.state.snapshots.length, 0); assert.equal(f.state.audits.length, 0);
  f.state.auditFail = false;
  await Promise.all([f.call('createSnapshot'), f.call('createSnapshot'), f.call('createSnapshot')]);
  assert.deepEqual(f.state.snapshots.map((s) => s.version), [1, 2, 3]); assert.equal(f.state.audits.length, 3);
});

test('validation: malformed identifiers, oversize lists, cross-tenant query controls and invented approval rejected', async () => {
  const f = fixture();
  for (const query of [{ limit: '51' }, { limit: '-1' }, { limit: ['1'] }, { limit: '1.5' }, { organizationId: other }, { beforeVersion: '0' }]) assert.equal((await f.call('listSnapshots', { ...f.req(), query })).statusCode, 422);
  assert.equal((await f.call('getLiveReport', { ...f.req(), params: { periodId: 'not-an-id' } })).statusCode, 422);
  for (const body of [{ status: 'approved' }, { status: 'reviewed' }, { narrative: 'injected' }, { organizationId: other }, [], null]) assert.equal((await f.call('createSnapshot', { ...f.req(), body })).statusCode, 422);
  const r = f.req(); r.query = { format: 'pdf' }; assert.equal((await f.call('downloadSnapshot', r)).statusCode, 422);
  assert.equal(f.state.snapshots.length, 0);
});

test('metrics: real evidence links, active/tenant/deleted filtering, deduplication and explicit recorded-not-verified semantics', () => {
  const a2 = { ...action, id: 'action-2', readinessScore: 0 }; const a3 = { ...action, id: 'action-3', isActive: false };
  const evidence = [{ organizationId: org, actionId: a2.id, isVerified: false }, { organizationId: org, actionId: a2.id }, { organizationId: other, actionId }, { organizationId: org, actionId, deletedAt: '2026-10-01' }, { organizationId: org, actionId: a3.id }];
  const metrics = computeEvidenceCoverage([action, a2, a3], evidence, org); assert.equal(metrics.evidenceCoverage, 50); assert.equal(metrics.recordedEvidenceLinks, 2); assert.equal(metrics.evidenceCoverageDefinition, EVIDENCE_DEFINITION); assert.equal(computeEvidenceCoverage([], [], org).evidenceCoverage, 0);
  const r = buildReport({ organizationId: org, strategy, period, actions: [action, a2], statuses: [{ organizationId: org, strategyId, code: 'on_track', category: 'on_track', label: 'Track 1' }, { organizationId: org, strategyId, code: 'custom_track', category: 'on_track', label: 'Track 2' }], updates: [{ organizationId: org, actionId, reportingPeriodId: periodId, workflowStatus: 'included_in_report' }, { organizationId: org, actionId, reportingPeriodId: periodId, workflowStatus: 'included_in_report' }, { organizationId: org, actionId: a2.id, reportingPeriodId: periodId, workflowStatus: 'draft' }], funding: [{ organizationId: org, actionId, currencyCode: 'AUD', amount: '10.25', status: 'identified' }, { organizationId: org, actionId, currencyCode: 'NZD', amount: '20.50', status: 'secured' }] });
  assert.equal(r.summary.updateCoverage, 50); assert.equal(r.summary.includedUpdates, 1); assert.equal(r.summary.fundingByCurrency.AUD.secured, 0); assert.equal(r.summary.fundingByCurrency.NZD.secured, 20.5);
});

test('safe allowlist: snapshot excludes private metadata/credentials/URLs and preserves known capture provenance', () => {
  const report = makeReport(); report.strategy.metadata = { token: 'PRIVATE_CREDENTIAL' }; report.actions[0].actionOwner = { email: 'PRIVATE_EMAIL', passwordHash: 'PRIVATE_HASH' };
  report.evidence = [{ id: 'e1', title: 'Council source', evidenceType: 'document', actionId, storageKey: 'PRIVATE_STORAGE_KEY', externalUrl: 'https://private.test/?token=PRIVATE_TOKEN', source: 'https://private.test/?token=PRIVATE_TOKEN', recordedAt: '2026-09-01T12:00:00.000Z' }, { title: 'Plain source', source: 'Council economic development team' }];
  const snapshot = serializeSnapshot({ id: 's1', version: 3, status: 'approved', content: report, preparedBy: 'PRIVATE_USER', approvedBy: 'PRIVATE_USER', createdAt: '2026-10-01T12:00:00.000Z' }, true);
  assert.equal(snapshot.status, 'approved'); assert.equal(snapshot.approvalStatus, 'not_certified'); assert.equal(snapshot.content.evidence[0].recordedAt, '2026-09-01T12:00:00.000Z'); assert.equal(snapshot.content.evidence[1].source, 'Council economic development team');
  for (const exportValue of [JSON.stringify(snapshot), reportCsv(snapshot.content), reportHtml(snapshot.content, snapshot)]) assert.doesNotMatch(exportValue, /PRIVATE_|private\.test|passwordHash|storageKey|externalUrl/);
});

test('legacy metric is not misrepresented as current evidence coverage; historic values are not recomputed', () => {
  const legacy = makeReport(); delete legacy.schemaVersion; legacy.summary.evidenceCoverage = 99;
  assert.equal(serializeReport(legacy).summary.evidenceCoverage, null); assert.match(serializeReport(legacy).summary.evidenceCoverageDefinition, /Legacy snapshot/);
  const newReport = makeReport(); assert.equal(serializeReport(newReport).summary.evidenceCoverage, 0);
});

test('export hardening: HTML escapes hostile titles and CSV neutralizes formula prefixes; limits reject rather than truncate', () => {
  const r = makeReport('<img src=x onerror=alert(1)>'); const html = reportHtml(r); assert.doesNotMatch(html, /<img src=x/); assert.match(html, /&lt;img/); assert.match(html, /@media print/); assert.match(html, /scope="col"/); assert.match(html, /window\.print/); assert.doesNotMatch(html, /<script src|<link|<iframe/);
  for (const value of ['=1+1', '+cmd', '-1', '@SUM(1)', ' \t=cmd']) assert.match(csvCell(value), /^"'/);
  assert.equal(csvCell('quote,"value'), '"quote,""value"');
  assert.throws(() => buildReport({ organizationId: org, strategy, period, actions: Array(REPORT_ROW_LIMIT + 1).fill(action) }), /safe row limit/);
  assert.throws(() => serializeReport({ actions: Array(REPORT_ROW_LIMIT + 1).fill(action) }), /safe row limit/);
  const large = makeReport(); large.updates = Array(300).fill({ achievements: 'x'.repeat(12000) }); assert.throws(() => serializeReport(large), /2 MiB/);
});

test('standalone router exports no mutation endpoints except draft snapshot creation; repository requires locked version allocation', async () => {
  const source = await readFile(new URL('../src/routes/v1/reportSnapshots.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /router\.(?:patch|put|delete)\(/); assert.match(source, /export const reportSnapshotsRouter/);
  const repository = await readFile(new URL('../src/services/reportRepository.js', import.meta.url), 'utf8'); assert.match(repository, /REPEATABLE_READ/); assert.match(repository, /transaction\.LOCK\.UPDATE/); assert.match(repository, /paranoid: false/); assert.match(repository, /REPORT_ROW_LIMIT \+ 1/);
});
