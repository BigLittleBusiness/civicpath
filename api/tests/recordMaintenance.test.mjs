import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaintenanceService, validateChanges, safeEvidenceUrl, MaintenanceError, MAINTENANCE_KINDS } from '../src/services/recordMaintenance.js';
import { migrateRecordMaintenance } from '../db/migrations/015_record_maintenance.mjs';

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const org = id(1); const foreignOrg = id(2); const actor = id(3); const projectId = id(4); const actionId = id(5); const strategyId = id(6); const date = '2026-11-01T01:02:03.000Z';
function harness(role = 'portfolio_manager') {
  const store = {}; const auditRows = []; let failure = false; let sequence = 100; let queue = Promise.resolve();
  const matches = (row, where) => Object.entries(where).every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value);
  function row(data) { return Object.assign({}, data, { get() { return Object.fromEntries(Object.entries(this).filter(([, value]) => typeof value !== 'function')); }, async update(changes, options) { assert.ok(options?.transaction, 'all writes must be transactional'); Object.assign(this, changes); return this; } }); }
  const names = new Set(['User', 'CollaborationParticipant', 'ProjectPriority', 'Grant', 'Priority', 'StrategyFocusArea', 'ActionDependency', 'StrategyStatusDefinition', 'StrategicPlan', ...Object.values(MAINTENANCE_KINDS).map((spec) => spec.model), 'Archive']);
  const models = Object.fromEntries([...names].map((name) => { store[name] = []; return [name, {
    async findOne({ where }) { return store[name].find((item) => matches(item, where)) || null; },
    async findAll({ where, limit, offset = 0 } = {}) { return store[name].filter((item) => !where || matches(item, where)).slice(offset, limit === undefined ? undefined : offset + limit); },
    async create(data, options) { assert.ok(options?.transaction, 'metadata/support creates must be transactional'); const instance = row({ id: id(++sequence), createdAt: date, updatedAt: date, ...data }); store[name].push(instance); return instance; },
  }]; }));
  const seed = (model, data) => { const instance = row({ id: id(++sequence), organizationId: org, createdAt: date, updatedAt: date, ...data }); store[model].push(instance); return instance; };
  seed('User', { id: actor, role, status: 'active', sessionVersion: 1 });
  seed('CivicProject', { id: projectId, name: 'Council project', ownerId: actor, stage: 'delivery', category: 'other' });
  seed('StrategicPlan', { id: strategyId, status: 'active' });
  seed('StrategyAction', { id: actionId, title: 'Council action', strategyId, ownerId: actor, status: 'not_started', isActive: true });
  for (const [code, category] of [['not_started', 'not_started'], ['on_track', 'on_track'], ['finished', 'complete']]) seed('StrategyStatusDefinition', { strategyId, code, label: code, category, isActive: true });
  const req = { auth: { sub: actor, organizationId: org, role, sessionVersion: 1 }, tenant: { organizationId: org }, body: {}, query: {} };
  const sequelize = { transaction(operation) {
    const execute = async () => {
      const backup = Object.fromEntries(Object.entries(store).map(([name, rows]) => [name, rows.map((item) => item.get())])); const auditCount = auditRows.length;
      try { return await operation({ LOCK: { UPDATE: 'UPDATE' } }); }
      catch (error) { for (const [name, rows] of Object.entries(backup)) store[name] = rows.map(row); auditRows.splice(auditCount); throw error; }
    };
    const result = queue.then(execute); queue = result.catch(() => {}); return result;
  } };
  const service = createMaintenanceService({ sequelize, models, Archive: models.Archive, audit: async (_req, data) => { assert.ok(data.transaction); if (failure) throw new Error('forced audit failure'); auditRows.push(data); } });
  const edit = async (kind, recordId, changes, override = {}) => { const current = await service.get(req, kind, recordId); req.body = { changes, expectedUpdatedAt: current.updatedAt, expectedVersion: current.maintenance.version, ...override }; return service.mutate(req, kind, recordId, 'edit'); };
  const lifecycle = async (kind, recordId, operation) => { const current = await service.get(req, kind, recordId); req.body = { expectedUpdatedAt: current.updatedAt, expectedVersion: current.maintenance.version, ...(operation === 'archive' ? { reason: 'Superseded but retained' } : {}) }; return service.mutate(req, kind, recordId, operation); };
  return { service, req, store, models, seed, edit, lifecycle, auditRows, setAuditFailure(value) { failure = value; } };
}
const rejectsStatus = (promise, status) => assert.rejects(promise, (error) => error instanceof MaintenanceError && error.status === status);

test('strict allowlists reject malformed URLs, IDs, numbers, dates, unconfigured storage and mass assignment', () => {
  for (const url of ['javascript:alert(1)', 'data:text/plain,test', 'ftp://files.example.test/a', 'https://user:secret@example.test', '//example.test', 'https://example.test/has space']) assert.equal(safeEvidenceUrl(url), false, url);
  assert.equal(safeEvidenceUrl('https://records.example.test/evidence/1'), true);
  for (const [kind, changes] of [['evidence', { storageKey: 'private/key' }], ['projects', { organizationId: foreignOrg }], ['projects', { stage: 'archived' }], ['projects', { ownerId: 'bad-id' }], ['work-items', { status: 'archived' }], ['work-items', { dueDate: '2026-02-30' }], ['funding', { amount: -1 }], ['funding', { amount: Infinity }], ['measures', { name: 'x'.repeat(201) }], ['actions', { isActive: false }]]) assert.throws(() => validateChanges(kind, changes), MaintenanceError);
  assert.throws(() => validateChanges('projects', {}), MaintenanceError);
  assert.deepEqual(validateChanges('work-items', { status: 'complete', dueDate: null }), { status: 'complete', dueDate: null });
});

test('manager edits every supported record kind atomically, creates metadata and preserves lifecycle/status', async () => {
  const h = harness();
  const rows = [
    ['projects', projectId, { name: 'Edited project' }], ['actions', actionId, { status: 'finished', nextStep: 'Done' }],
    ['work-items', h.seed('WorkItem', { projectId, title: 'Work', status: 'not_started' }).id, { status: 'complete' }],
    ['evidence', h.seed('EvidenceItem', { projectId, title: 'Evidence', storageKey: 'never-return-this' }).id, { externalUrl: 'https://records.example.test/1' }],
    ['milestones', h.seed('ActionMilestone', { actionId, title: 'Milestone' }).id, { status: 'complete' }],
    ['measures', h.seed('StrategyMeasure', { actionId, name: 'Measure' }).id, { currentValue: '12', lastMeasuredAt: '2026-11-03' }],
    ['action-evidence', h.seed('ActionEvidenceLink', { actionId, title: 'Action evidence' }).id, { source: 'Council record' }],
    ['funding', h.seed('ActionFundingPosition', { actionId, sourceName: 'Funding' }).id, { amount: 100.25, status: 'secured' }],
    ['stakeholders', h.seed('StrategyStakeholder', { actionId, name: 'Stakeholder' }).id, { engagementStatus: 'supportive' }],
    ['risks', h.seed('StrategyRiskIssue', { actionId, strategyId, title: 'Risk' }).id, { status: 'resolved' }],
    ['decisions', h.seed('StrategyDecision', { actionId, strategyId, title: 'Decision' }).id, { decisionStatus: 'approved', decisionText: 'Adopted' }],
  ];
  for (const [kind, recordId, changes] of rows) {
    const result = await h.edit(kind, recordId, changes);
    assert.equal(result.maintenance.version, 1); assert.equal(h.auditRows.at(-1).entityId, recordId);
    assert.equal(Object.hasOwn(result, 'storageKey'), false);
    if (kind === 'milestones') assert.ok(result.completedAt);
    if (kind === 'risks') assert.ok(result.resolvedAt);
  }
  assert.equal(h.store.Archive.length, rows.length);
  assert.equal(h.store.CivicProject[0].stage, 'delivery');
  assert.equal(h.store.StrategyAction[0].isActive, true);
  assert.equal((await h.service.get(h.req, 'actions', actionId)).maintenance.fields.status.completeCode, 'finished');
});

test('executive, platform admin, stale JWT role and unauthenticated identity cannot write', async () => {
  for (const role of ['executive', 'platform_admin']) {
    const h = harness(role); h.req.body = { changes: { name: 'Blocked' }, expectedVersion: 0, expectedUpdatedAt: date };
    await rejectsStatus(h.service.mutate(h.req, 'projects', projectId, 'edit'), 403);
    assert.equal(h.store.Archive.length, 0);
  }
  const h = harness('executive'); h.req.auth.role = 'org_admin';
  await rejectsStatus(h.edit('projects', projectId, { name: 'Blocked' }), 403);
  h.req.auth = null; await rejectsStatus(h.service.get(h.req, 'projects', projectId), 401);
});

test('contributor delivery changes require ownership or permitted participation and cannot assign/configure/approve/archive', async () => {
  const h = harness('contributor'); const work = h.seed('WorkItem', { projectId, title: 'Work', status: 'not_started' });
  assert.equal((await h.edit('work-items', work.id, { status: 'complete' })).status, 'complete');
  await rejectsStatus(h.edit('work-items', work.id, { ownerId: actor }), 403);
  await rejectsStatus(h.edit('projects', projectId, { name: 'Blocked' }), 403);
  await rejectsStatus(h.lifecycle('work-items', work.id, 'archive'), 403);
  const decision = h.seed('StrategyDecision', { actionId, strategyId, title: 'Decision' });
  await rejectsStatus(h.edit('decisions', decision.id, { decisionStatus: 'approved' }), 403);
  const risk = h.seed('StrategyRiskIssue', { actionId, strategyId, title: 'Risk' });
  await rejectsStatus(h.edit('risks', risk.id, { status: 'accepted' }), 403);
  h.store.CivicProject[0].ownerId = null;
  await rejectsStatus(h.edit('work-items', work.id, { status: 'blocked' }), 403);
  h.seed('CollaborationParticipant', { resourceType: 'project', resourceId: projectId, userId: actor, role: 'contributor' });
  assert.equal((await h.edit('work-items', work.id, { status: 'blocked' })).status, 'blocked');
});

test('cross-tenant target IDs, owners, projects, grants, actions and same-tenant wrong-strategy references are rejected', async () => {
  const h = harness(); const foreignProject = h.seed('CivicProject', { organizationId: foreignOrg, name: 'Foreign' });
  await rejectsStatus(h.service.get(h.req, 'projects', foreignProject.id), 404);
  h.req.body = { changes: { name: 'Blocked' }, expectedVersion: 0, expectedUpdatedAt: date };
  await rejectsStatus(h.service.mutate(h.req, 'projects', foreignProject.id, 'edit'), 404);
  const foreignOwner = h.seed('User', { organizationId: foreignOrg, status: 'active', role: 'contributor' });
  await rejectsStatus(h.edit('projects', projectId, { ownerId: foreignOwner.id }), 422);
  const work = h.seed('WorkItem', { projectId, title: 'Work' });
  await rejectsStatus(h.edit('work-items', work.id, { projectId: foreignProject.id }), 422);
  const foreignGrant = h.seed('Grant', { organizationId: foreignOrg });
  await rejectsStatus(h.edit('work-items', work.id, { grantId: foreignGrant.id }), 422);
  const otherStrategy = h.seed('StrategicPlan', { status: 'active' });
  const otherAction = h.seed('StrategyAction', { strategyId: otherStrategy.id, isActive: true, title: 'Other action' });
  const decision = h.seed('StrategyDecision', { actionId, strategyId, title: 'Decision' });
  await rejectsStatus(h.edit('decisions', decision.id, { actionId: otherAction.id }), 422);
  const foreignAction = h.seed('StrategyAction', { organizationId: foreignOrg, strategyId, isActive: true, title: 'Foreign action' });
  await rejectsStatus(h.edit('decisions', decision.id, { actionId: foreignAction.id }), 422);
  const focus = h.seed('StrategyFocusArea', { strategyId: otherStrategy.id, status: 'active' });
  await rejectsStatus(h.edit('actions', actionId, { focusAreaId: focus.id }), 422);
  h.req.query = { projectId: foreignProject.id }; await rejectsStatus(h.service.list(h.req, 'work-items'), 404);
});

test('owner allowlist excludes disabled/executive users; owner assignments and priority mirrors are transactional', async () => {
  const h = harness();
  for (const [status, role] of [['disabled', 'contributor'], ['active', 'executive']]) {
    const owner = h.seed('User', { status, role }); await rejectsStatus(h.edit('projects', projectId, { ownerId: owner.id }), 422);
  }
  const owner = h.seed('User', { status: 'active', role: 'contributor' }); const priority = h.seed('Priority', { status: 'active', title: 'Priority' });
  const result = await h.edit('projects', projectId, { ownerId: owner.id, priorityId: priority.id });
  assert.equal(result.ownerId, owner.id); assert.equal(h.store.ProjectPriority[0].isPrimary, true);
  await h.edit('projects', projectId, { priorityId: null }); assert.equal(h.store.ProjectPriority[0].isPrimary, false);
  const options = await h.service.options(h.req, 'owners'); assert.equal(options.data.some((item) => item.role === 'executive'), false); assert.equal(options.data.some((item) => 'email' in item), false);
});

test('archive/restore preserves records and existing status, blocks edits under archived parents and filters archives', async () => {
  const h = harness(); const work = h.seed('WorkItem', { projectId, title: 'Work', status: 'in_progress' });
  const result = await h.lifecycle('projects', projectId, 'archive'); assert.ok(result.maintenance.archivedAt);
  assert.equal(h.store.CivicProject.length, 1); assert.equal(h.store.CivicProject[0].stage, 'delivery');
  await rejectsStatus(h.edit('work-items', work.id, { status: 'complete' }), 403);
  h.req.query = { archived: 'true' }; assert.equal((await h.service.list(h.req, 'projects')).data.length, 1);
  h.req.query = { archived: 'false' }; assert.equal((await h.service.list(h.req, 'projects')).data.length, 0);
  await h.lifecycle('projects', projectId, 'restore'); assert.equal((await h.service.get(h.req, 'projects', projectId)).maintenance.archivedAt, null);
  assert.equal((await h.edit('work-items', work.id, { status: 'complete' })).status, 'complete');
  await h.lifecycle('actions', actionId, 'archive'); assert.equal(h.store.StrategyAction[0].isActive, false);
  await h.lifecycle('actions', actionId, 'restore'); assert.equal(h.store.StrategyAction[0].isActive, true);
});

test('updatedAt and monotonic version reject stale or missing preconditions, including simultaneous edits', async () => {
  const h = harness();
  await rejectsStatus(h.edit('projects', projectId, { name: 'stale' }, { expectedUpdatedAt: '2026-10-01T00:00:00.000Z' }), 409);
  h.req.body = { changes: { name: 'Missing' } }; await rejectsStatus(h.service.mutate(h.req, 'projects', projectId, 'edit'), 428);
  h.req.body = { changes: { name: 'First' }, expectedVersion: 0, expectedUpdatedAt: date };
  const req1 = { ...h.req, body: { ...h.req.body } }; const req2 = { ...h.req, body: { ...h.req.body, changes: { name: 'Second' } } };
  const results = await Promise.allSettled([h.service.mutate(req1, 'projects', projectId, 'edit'), h.service.mutate(req2, 'projects', projectId, 'edit')]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
  assert.equal(h.store.CivicProject[0].name, 'First'); assert.equal(h.store.Archive[0].version, 1);
});

test('dependent audit failure rolls back primary edit, archive metadata, priority mirror and action archive', async () => {
  const h = harness(); h.setAuditFailure(true); const priority = h.seed('Priority', { title: 'Priority', status: 'active' });
  await assert.rejects(h.edit('projects', projectId, { name: 'Must roll back', priorityId: priority.id }), /forced audit failure/);
  assert.equal(h.store.CivicProject[0].name, 'Council project'); assert.equal(h.store.ProjectPriority.length, 0); assert.equal(h.store.Archive.length, 0); assert.equal(h.auditRows.length, 0);
  await assert.rejects(h.lifecycle('actions', actionId, 'archive'), /forced audit failure/);
  assert.equal(h.store.StrategyAction[0].isActive, true); assert.equal(h.store.Archive.length, 0);
});

test('evidence material edits invalidate verification and do not expose storage paths', async () => {
  const h = harness('contributor'); const evidence = h.seed('EvidenceItem', { projectId, title: 'Evidence', externalUrl: 'https://example.test/old', isVerified: true, storageKey: 'private/path' });
  const result = await h.edit('evidence', evidence.id, { externalUrl: 'https://example.test/new' });
  assert.equal(result.isVerified, false); assert.equal('storageKey' in result, false);
  await rejectsStatus(h.edit('evidence', evidence.id, { isVerified: true }), 403);
});

test('pagination and list filter allowlists cap data and reject unsupported scope', async () => {
  const h = harness(); for (let i = 0; i < 26; i += 1) h.seed('WorkItem', { projectId, title: `Work ${i}` });
  h.req.query = { projectId }; const page = await h.service.list(h.req, 'work-items'); assert.equal(page.data.length, 25); assert.equal(page.pagination.hasMore, true);
  h.req.query = { projectId, offset: '25' }; assert.equal((await h.service.list(h.req, 'work-items')).data.length, 1);
  for (const query of [{ limit: '101' }, { organizationId: foreignOrg }, { strategyId }, { archived: 'yes' }]) { h.req.query = query; await rejectsStatus(h.service.list(h.req, 'work-items'), 422); }
});

test('migration 015 creates only standalone metadata and indexes, reruns without writes or cutover', async () => {
  const tables = []; const indexes = []; const calls = [];
  const query = { showAllTables: async () => tables, createTable: async (name, schema) => { tables.push(name); calls.push(['table', name]); assert.equal(schema.record_id.allowNull, false); }, showIndex: async () => indexes, addIndex: async (_table, fields, options) => { indexes.push({ name: options.name }); calls.push(['index', fields, options]); } };
  const types = { UUID: 'uuid', STRING: (size) => `varchar(${size})`, INTEGER: { UNSIGNED: 'uint' }, DATE: 'date', BOOLEAN: 'bool' };
  await migrateRecordMaintenance(query, types); assert.equal(calls.length, 3); assert.equal(calls[1][2].unique, true);
  await migrateRecordMaintenance(query, types); assert.equal(calls.length, 3); assert.deepEqual(tables, ['RecordMaintenanceState']);
});

test('disabled users and session-version mismatches cannot use read or mutation endpoints', async () => {
  const h = harness();
  h.req.auth.sessionVersion = 0;
  await rejectsStatus(h.service.get(h.req, 'projects', projectId), 401);
  h.req.body = { changes: { name: 'Blocked' }, expectedVersion: 0, expectedUpdatedAt: date };
  await rejectsStatus(h.service.mutate(h.req, 'projects', projectId, 'edit'), 401);
  h.req.auth.sessionVersion = 1; h.store.User[0].status = 'disabled';
  await rejectsStatus(h.service.get(h.req, 'projects', projectId), 401);
  assert.equal(h.store.Archive.length, 0);
});

test('archived project cannot be newly linked and malformed archive requests cannot create metadata', async () => {
  const h = harness(); const project = h.seed('CivicProject', { name: 'Archive candidate' });
  await h.lifecycle('projects', project.id, 'archive');
  const work = h.seed('WorkItem', { projectId, title: 'Work' });
  await rejectsStatus(h.edit('work-items', work.id, { projectId: project.id }), 422);
  h.req.body = { expectedVersion: 0, expectedUpdatedAt: date, reason: '' };
  await rejectsStatus(h.service.mutate(h.req, 'work-items', work.id, 'archive'), 422);
  assert.equal(h.store.Archive.length, 1);
  assert.equal(h.store.WorkItem[0].projectId, projectId);
});

test('historical unsafe evidence URLs are omitted from maintenance read responses', async () => {
  const h = harness();
  for (const externalUrl of ['javascript:alert(1)', 'https://user:password@example.test/document']) {
    const evidence = h.seed('EvidenceItem', { projectId, title: 'Legacy evidence', externalUrl });
    assert.equal((await h.service.get(h.req, 'evidence', evidence.id)).externalUrl, null);
    assert.equal(h.store.EvidenceItem.find((item) => item.id === evidence.id).externalUrl, externalUrl, 'read does not destructively rewrite legacy data');
  }
});
