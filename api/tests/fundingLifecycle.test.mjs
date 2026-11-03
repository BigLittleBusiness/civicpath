import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFundingLifecycleHandlers, validateFundingInput, money, dateOnly, safeFundingUrl, assertTransition, fundingCsv, serializeFunding, FundingError, GRANT_TRANSITIONS, PATHWAY_TRANSITIONS } from '../src/services/fundingLifecycle.js';
import { applyFundingLifecycleSchema } from '../db/fundingLifecycleSchema.mjs';

const org = randomUUID(); const otherOrg = randomUUID(); const admin = randomUUID(); const project = randomUUID();
const timestamp = '2026-11-03T09:00:00.000Z';
function fixture(role = 'org_admin') {
  let rows = { User: [{ id: admin, organizationId: org, role, status: 'active' }], Organization: [{ id: org, defaultCurrency: 'NZD' }], CivicProject: [{ id: project, organizationId: org, isSample: false, currencyCode: 'NZD', name: 'Real project' }], Grant: [], FundingPathway: [], EvidenceItem: [], WorkItem: [], AuditLog: [], FundingLifecycleRecord: [] };
  let auditFails = false; const Op = { in: Symbol('in'), notIn: Symbol('notIn'), like: Symbol('like') };
  const match = (row, where) => Object.entries(where || {}).every(([key, value]) => {
    if (value && typeof value === 'object') {
      if (value[Op.in] && Array.isArray(value[Op.in])) return value[Op.in].includes(row[key]);
      return true; // Static correlated SQL is checked separately by query contract assertions.
    }
    return row[key] === value;
  });
  const wrap = (row) => row ? Object.assign(row, {
    get() { return Object.fromEntries(Object.entries(this).filter(([, value]) => typeof value !== 'function')); },
    async update(values) { Object.assign(this, values); return this; },
    async reload(options) { assert.ok(options?.transaction); return this; },
  }) : null;
  const models = Object.fromEntries(Object.keys(rows).map((name) => [name, {
    async findOne({ where }) { return wrap(rows[name].find((row) => match(row, where))); },
    async findAll({ where } = {}) { return rows[name].filter((row) => match(row, where)).map(wrap); },
    async findAndCountAll({ where, limit, offset = 0 }) { const filtered = rows[name].filter((row) => match(row, where)); return { count: filtered.length, rows: filtered.slice(offset, offset + limit).map(wrap) }; },
    async create(values, options) {
      assert.ok(options?.transaction, `Every ${name} create must use a transaction`);
      const row = { id: randomUUID(), createdAt: timestamp, updatedAt: timestamp, ...values };
      if (name === 'FundingLifecycleRecord') Object.assign(row, { archivedAt: null, version: 0, ...values });
      rows[name].push(row); return wrap(row);
    },
  }]));
  const sequelize = { async transaction(callback) {
    const snapshot = structuredClone(Object.fromEntries(Object.entries(rows).map(([name, values]) => [name, values.map((row) => Object.fromEntries(Object.entries(row).filter(([, value]) => typeof value !== 'function')))])));
    try { return await callback({ LOCK: { UPDATE: 'UPDATE', SHARE: 'SHARE' } }); }
    catch (error) { rows = snapshot; throw error; }
  } };
  const audit = async (req, event) => {
    assert.ok(event.transaction, 'Audit must use the same transaction');
    if (auditFails) throw new Error('forced audit failure');
    await models.AuditLog.create({ organizationId: req.tenant.organizationId, ...event }, { transaction: event.transaction });
  };
  const handlers = createFundingLifecycleHandlers({ sequelize, models, audit, Op, literal: (sql) => ({ sql }) });
  const req = (body = {}, id) => ({ body, params: { id }, query: {}, auth: { sub: admin, organizationId: org, role }, tenant: { organizationId: org } });
  async function call(name, request) {
    let status = 200; let body; let forwarded;
    const res = { status(code) { status = code; return this; }, json(value) { body = value; return this; }, set() { return this; }, send(value) { body = value; return this; } };
    await handlers[name](request, res, (error) => { forwarded = error; });
    return { status, body, forwarded };
  }
  return { get rows() { return rows; }, call, req, failAudit() { auditFails = true; } };
}
const grantBody = (overrides = {}) => ({ title: 'Council-entered opportunity', funder: 'Council source', projectId: project, requestedAmount: '10.10', currencyCode: 'NZD', ...overrides });
const stamp = (row) => ({ version: row.version, updatedAt: row.updatedAt, reason: 'Council reviewed this change' });

for (const role of ['org_admin', 'portfolio_manager', 'contributor']) test(`${role} can create audited manual grant and pathway`, async () => {
  const f = fixture(role); const grant = await f.call('createGrant', f.req(grantBody()));
  assert.equal(grant.status, 201); assert.equal(grant.body.data.provenance, 'council_entered'); assert.equal(grant.body.data.requestedAmount, '10.10');
  assert.equal(grant.body.data.currencyCode, 'NZD'); assert.equal(grant.body.data.enteredBy, admin);
  const pathway = await f.call('createPathway', f.req({ sourceName: 'Manual option', projectId: project, potentialAmount: '0' }));
  assert.equal(pathway.status, 201); assert.equal(pathway.body.data.currencyCode, 'NZD'); assert.equal(pathway.body.data.potentialAmount, '0.00');
  assert.equal(f.rows.AuditLog.length, 2);
});
for (const role of ['executive', 'platform_admin', 'unknown']) test(`${role} cannot create or mutate a manual funding record`, async () => {
  const f = fixture(role);
  for (const name of ['createGrant', 'createPathway', 'updateGrant', 'archiveGrant', 'reactivateGrant']) assert.equal((await f.call(name, f.req(grantBody(), randomUUID()))).status, 403);
  assert.equal(f.rows.Grant.length, 0);
});
test('unauthenticated and mismatched tenancy are rejected before persistence', async () => {
  const f = fixture(); const anonymous = f.req(grantBody()); delete anonymous.auth;
  assert.equal((await f.call('createGrant', anonymous)).status, 401);
  const mismatch = f.req(grantBody()); mismatch.tenant.organizationId = otherOrg;
  assert.equal((await f.call('createGrant', mismatch)).status, 403);
});
test('current database role overrides stale token role', async () => {
  const f = fixture('executive'); const req = f.req(grantBody()); req.auth.role = 'org_admin';
  assert.equal((await f.call('createGrant', req)).status, 403);
});
test('wrong-tenant project, owner, pathway, evidence and work IDs are never linked', async () => {
  const f = fixture(); const bad = randomUUID();
  f.rows.CivicProject.push({ id: bad, organizationId: otherOrg, isSample: false });
  f.rows.User.push({ id: bad, organizationId: otherOrg, status: 'active', role: 'contributor' });
  f.rows.FundingPathway.push({ id: bad, organizationId: otherOrg, projectId: project, currencyCode: 'NZD' });
  f.rows.EvidenceItem.push({ id: bad, organizationId: otherOrg }); f.rows.WorkItem.push({ id: bad, organizationId: otherOrg });
  for (const field of ['projectId', 'leadId', 'fundingPathwayId', 'evidenceIds', 'workItemIds']) {
    const response = await f.call('createGrant', f.req(grantBody({ [field]: field.endsWith('Ids') ? [bad] : bad })));
    assert.equal(response.status, 422, field); assert.equal(response.body.code, 'funding_reference_scope');
  }
  assert.equal(f.rows.Grant.length, 0);
});
test('sample references are excluded and cannot be edited', async () => {
  const f = fixture(); f.rows.CivicProject[0].isSample = true;
  assert.equal((await f.call('createGrant', f.req(grantBody()))).status, 422);
  const id = randomUUID(); f.rows.Grant.push({ id, organizationId: org, isSample: true });
  assert.equal((await f.call('getGrant', f.req({}, id))).status, 404);
});
test('reference project consistency, existing grant links and disabled owners are enforced', async () => {
  const f = fixture(); const id = randomUUID();
  f.rows.EvidenceItem.push({ id, organizationId: org, projectId: randomUUID() });
  assert.equal((await f.call('createGrant', f.req(grantBody({ evidenceIds: [id] })))).status, 422);
  f.rows.EvidenceItem[0].projectId = project; f.rows.EvidenceItem[0].grantId = randomUUID();
  assert.equal((await f.call('createGrant', f.req(grantBody({ evidenceIds: [id] })))).status, 422);
  f.rows.User.push({ id, organizationId: org, status: 'disabled' });
  assert.equal((await f.call('createGrant', f.req(grantBody({ leadId: id })))).status, 422);
});
test('create plus audit plus sidecar roll back atomically on audit failure', async () => {
  for (const kind of ['Grant', 'Pathway']) {
    const f = fixture(); f.failAudit(); const body = kind === 'Grant' ? grantBody() : { sourceName: 'Must roll back', projectId: project };
    const response = await f.call(`create${kind}`, f.req(body)); assert.match(response.forwarded.message, /persistence failed/);
    assert.equal(response.forwarded.message.includes('forced audit'), false);
    assert.equal(f.rows.Grant.length + f.rows.FundingPathway.length + f.rows.FundingLifecycleRecord.length + f.rows.AuditLog.length, 0);
  }
});
test('valid lifecycle transitions edit details, owner, dates, amounts and links; no fake percentage', async () => {
  const f = fixture(); const evidence = randomUUID(); const work = randomUUID();
  f.rows.EvidenceItem.push({ id: evidence, organizationId: org, projectId: project, title: 'Council evidence', isVerified: false });
  f.rows.WorkItem.push({ id: work, organizationId: org, projectId: project, title: 'Real work', status: 'not_started' });
  let record = (await f.call('createGrant', f.req(grantBody()))).body.data;
  const result = await f.call('updateGrant', f.req({ ...stamp(record), status: 'assessing', leadId: admin, dueDate: '2027-01-01', acquittalDueDate: '2027-12-01', requestedAmount: '0', evidenceIds: [evidence], workItemIds: [work] }, record.id));
  assert.equal(result.status, 200); record = result.body.data; assert.equal(record.status, 'assessing'); assert.equal(record.requestedAmount, '0.00');
  const detail = await f.call('getGrant', f.req({}, record.id)); assert.equal(detail.body.data.evidence[0].title, 'Council evidence'); assert.equal(detail.body.data.workItems[0].title, 'Real work');
  assert.equal(Object.hasOwn(detail.body.data, 'progress'), false);
  for (const status of ['preparing', 'submitted', 'awarded', 'contracted', 'acquitting', 'acquitted']) {
    const next = await f.call('updateGrant', f.req({ ...stamp(record), status, awardedAmount: '8.99' }, record.id)); assert.equal(next.status, 200, status); record = next.body.data;
  }
  assert.deepEqual(record.allowedTransitions, []);
  assert.equal(f.rows.AuditLog.at(-1).action, 'status_changed');
});
test('invalid lifecycle jumps, missing award amount, reversed dates and relabeled currencies fail', async () => {
  const f = fixture(); let record = (await f.call('createGrant', f.req(grantBody()))).body.data;
  for (const changes of [{ status: 'awarded' }, { dueDate: '2027-02-01', acquittalDueDate: '2027-01-01' }, { currencyCode: 'AUD' }]) assert.ok((await f.call('updateGrant', f.req({ ...stamp(record), ...changes }, record.id))).status >= 400);
  for (const status of ['assessing', 'preparing', 'submitted']) record = (await f.call('updateGrant', f.req({ ...stamp(record), status }, record.id))).body.data;
  assert.equal((await f.call('updateGrant', f.req({ ...stamp(record), status: 'awarded' }, record.id))).status, 422);
});
test('optimistic versions and parent updatedAt reject stale and external edits', async () => {
  const f = fixture(); const record = (await f.call('createGrant', f.req(grantBody()))).body.data;
  assert.equal((await f.call('updateGrant', f.req({ ...stamp(record), notes: 'First edit' }, record.id))).status, 200);
  assert.equal((await f.call('updateGrant', f.req({ ...stamp(record), notes: 'Lost edit' }, record.id))).body.code, 'funding_edit_conflict');
  const current = (await f.call('getGrant', f.req({}, record.id))).body.data;
  assert.equal((await f.call('updateGrant', f.req({ ...stamp(current), updatedAt: '2026-10-01T00:00:00Z', notes: 'Stale parent' }, record.id))).body.code, 'funding_edit_conflict');
  assert.equal(f.rows.Grant[0].notes, 'First edit');
});
test('archive and reactivate retain status, reject duplicate archive and block archived edits', async () => {
  for (const kind of ['Grant', 'Pathway']) {
    const f = fixture(); let record = (await f.call(`create${kind}`, f.req(kind === 'Grant' ? grantBody() : { sourceName: 'Council option', projectId: project }))).body.data;
    record = (await f.call(`archive${kind}`, f.req(stamp(record), record.id))).body.data; assert.ok(record.archivedAt);
    assert.equal((await f.call(`archive${kind}`, f.req(stamp(record), record.id))).status, 409);
    assert.equal((await f.call(`update${kind}`, f.req({ ...stamp(record), ...(kind === 'Grant' ? { notes: 'Denied' } : { note: 'Denied' }) }, record.id))).body.code, 'funding_archived');
    const stage = record.status; record = (await f.call(`reactivate${kind}`, f.req(stamp(record), record.id))).body.data;
    assert.equal(record.archivedAt, null); assert.equal(record.status, stage); assert.equal(f.rows.AuditLog.at(-1).action, 'reactivated');
  }
});
test('update/archive required audit failure restores business and revision state', async () => {
  for (const operation of ['updateGrant', 'archiveGrant']) {
    const f = fixture(); const record = (await f.call('createGrant', f.req(grantBody()))).body.data; f.failAudit();
    const result = await f.call(operation, f.req({ ...stamp(record), ...(operation === 'updateGrant' ? { notes: 'Never persists' } : {}) }, record.id));
    assert.ok(result.forwarded); assert.equal(f.rows.Grant[0].notes, undefined); assert.equal(f.rows.FundingLifecycleRecord[0].version, 1); assert.equal(f.rows.FundingLifecycleRecord[0].archivedAt, null);
  }
});
test('cross-tenant reads and record mutations return non-leaking not-found', async () => {
  const f = fixture(); const id = randomUUID(); f.rows.Grant.push({ id, organizationId: otherOrg });
  for (const method of ['getGrant', 'updateGrant', 'archiveGrant']) {
    const body = method === 'updateGrant' ? { version: 0, updatedAt: timestamp, reason: 'Test', notes: 'Denied' } : { version: 0, updatedAt: timestamp, reason: 'Test' };
    assert.equal((await f.call(method, f.req(body, id))).status, 404);
  }
});
test('legacy provenance is explicitly unknown, never falsely Council-entered', () => {
  const record = serializeFunding('grant', { id: randomUUID(), title: 'Legacy', status: 'identified', requestedAmount: '0.00', currencyCode: 'AUD' });
  assert.equal(record.provenance, 'legacy_unverified'); assert.equal(record.version, 0); assert.equal(record.enteredBy, null);
});
test('allowlisted inputs reject unknown/protected fields and malformed dates, money, links and status', () => {
  for (const extra of [{ organizationId: otherOrg }, { provenance: 'council_entered' }, { status: 'awarded' }, { currencyCode: 'USD' }, { evidenceIds: [admin, admin] }, { workItemIds: Array(51).fill(admin) }, { title: 'x'.repeat(201) }]) assert.throws(() => validateFundingInput('grant', grantBody(extra)), FundingError);
  for (const amount of ['-1', '1.001', '1e3', '1000000000000', NaN, Infinity, {}, true]) assert.throws(() => money(amount), FundingError);
  for (const date of ['2027-02-29', '2027-04-31', '2027-01-01T00:00:00Z', '1800-01-01']) assert.throws(() => dateOnly(date), FundingError);
  assert.equal(dateOnly('2028-02-29'), '2028-02-29'); assert.equal(money('0'), '0.00');
});
test('safe URL protocol/hostname allowlist rejects executable, credential, IP and internal references', () => {
  for (const url of ['javascript:alert(1)', 'data:text/html,bad', 'http://council.gov.au', 'https://user:pass@council.gov.au', 'https://127.0.0.1', 'https://[::1]/', 'https://localhost', 'https://files.internal', 'https://council.gov.au:444', 'https://council.gov.au\\@evil.org']) assert.throws(() => safeFundingUrl(url), FundingError);
  assert.equal(safeFundingUrl('https://www.council.gov.au/source'), 'https://www.council.gov.au/source');
});
test('CSV protects formulas, escapes quotes and preserves currency and zero', () => {
  const csv = fundingCsv('grant', [{ id: admin, title: '=IMPORTXML("bad")', requestedAmount: '0.00', awardedAmount: '2.50', currencyCode: 'NZD', provenance: 'council_entered' }]);
  assert.ok(csv.includes('"\'=IMPORTXML(""bad"")"')); assert.ok(csv.includes('"0.00"')); assert.ok(csv.includes('"NZD"')); assert.ok(csv.startsWith('\ufeff'));
});
test('all transition edges are permitted, arbitrary shortcuts and terminal regressions are rejected', () => {
  for (const [kind, graph] of [['grant', GRANT_TRANSITIONS], ['pathway', PATHWAY_TRANSITIONS]]) {
    for (const [status, next] of Object.entries(graph)) {
      assert.doesNotThrow(() => assertTransition(kind, status, status));
      for (const target of next) assert.doesNotThrow(() => assertTransition(kind, status, target));
      for (const target of Object.keys(graph).filter((target) => target !== status && !next.includes(target))) assert.throws(() => assertTransition(kind, status, target), FundingError);
    }
  }
});
test('list/export pagination validates before query; executive can read real records', async () => {
  const f = fixture('executive'); const req = f.req(); req.query = { limit: '101' };
  assert.equal((await f.call('listGrants', req)).status, 422);
  req.query = {}; assert.equal((await f.call('listGrants', req)).status, 200);
  req.query = { offset: '0' }; assert.equal((await f.call('exportGrants', req)).status, 422);
});
test('migration 019 reruns without table recreation, duplicate indexes, or data changes', async () => {
  const tables = new Set(['Grant', 'FundingPathway', 'EvidenceItem', 'WorkItem']); const indexes = new Map(); const operations = [];
  const query = {
    async showAllTables() { return [...tables]; }, async createTable(name, definitions) { tables.add(name); operations.push(['table', name]); assert.ok(definitions.provenance); },
    async showIndex(name) { return (indexes.get(name) || []).map((name) => ({ name })); },
    async addIndex(table, fields, options) { indexes.set(table, [...(indexes.get(table) || []), options.name]); operations.push(['index', table, options.name]); },
  };
  const type = (length) => ({ length }); const DataTypes = { UUID: 'UUID', STRING: type, INTEGER: { UNSIGNED: 'UNSIGNED' }, DATE: 'DATE', JSON: 'JSON' };
  await applyFundingLifecycleSchema(query, DataTypes); const first = operations.length;
  await applyFundingLifecycleSchema(query, DataTypes); assert.equal(operations.length, first); assert.equal(first, 7);
});
