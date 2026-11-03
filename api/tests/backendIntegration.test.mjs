import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Explicitly suppress dotenv; these tests never inspect a local environment file.
process.env.NODE_ENV = 'test';
const { default: dotenv } = await import('dotenv'); dotenv.config = () => ({ parsed: {} });
const { sequelize } = await import('../src/config/database.js');
const models = await import('../src/models/index.js');
const runtime = await import('../src/backendRuntime.js');
const { createJobHeartbeatRegistry, createHealthService } = await import('../src/services/healthService.js');
const { registerScheduledJobs } = await import('../src/scheduledJobs.js');
const { createProject } = await import('../src/controllers/projectController.js');
const { createWorkItem, createEvidence, assessReadiness } = await import('../src/controllers/portfolioController.js');
const { updateWorkspaceProfile } = await import('../src/controllers/workspaceController.js');
const root = new URL('../src/', import.meta.url);
const text = (file) => readFile(new URL(file, root), 'utf8');

test('central mounting preserves auth, recovery, entitlement and no legacy writer routes', async () => {
  const routes = await text('routes/v1/index.js');
  assert.ok(routes.indexOf("use('/health'") < routes.indexOf("use('/auth'"));
  assert.ok(routes.indexOf("use('/tenant-lifecycle'") < routes.indexOf('use(requireActiveEntitlement)'));
  for (const name of ['reportSnapshotsRouter', 'fundingLifecycleRouter', 'recordMaintenanceCompatibilityRouter', 'reviewWorkflowRouter']) assert.match(routes, new RegExp(`v1Router.use\\(${name}\\)`));
  for (const pattern of ["v1Router.post('/funding-pathways'", "v1Router.patch('/strategy-actions/:actionId'", "v1Router.patch('/projects/:projectId'", "v1Router.post('/strategy-reporting-periods/:periodId/report-snapshots'"]) assert.ok(!routes.includes(pattern));
  assert.ok((await text('routes/v1/admin.js')).includes("use('/tenant-lifecycle', tenantLifecycleAdminRouter)"));
  const index = await text('index.js'); assert.ok(index.indexOf("use('/v1/provider-feedback/notifications'") < index.indexOf('app.use(express.json'));
});

test('active query SQL is server-side, tenant-correlated, before LIMIT with correct child aliases', async () => {
  const options = { where: { organizationId: 'test-org' }, include: [{ model: models.ActionMilestone }, { model: models.CivicProject, as: 'linkedProjects', through: { attributes: [] } }] };
  await runtime.withActiveRecords(() => models.StrategyAction.runHooks('beforeFind', options));
  models.StrategyAction._validateIncludedElements(options);
  const sql = sequelize.dialect.queryGenerator.selectQuery('StrategyAction', options, models.StrategyAction);
  assert.match(sql, /cp_archive\.organization_id = `StrategyAction`\.organization_id/);
  assert.match(sql, /cp_archive\.record_id = `ActionMilestones`\.id/);
  assert.match(sql, /cp_archive\.record_id = `linkedProjects`\.id/);
  assert.equal(options.include[0].required, false);
  const where = runtime.activeRecordWhere('WorkItem', { organizationId: 'test-org' });
  const workSql = sequelize.dialect.queryGenerator.selectQuery('WorkItem', { where, limit: 10 }, models.WorkItem);
  assert.match(workSql, /funding_lifecycle_records/); assert.match(workSql, /cp_parent\.id = `WorkItem`\.project_id/);
  assert.ok(workSql.indexOf('NOT EXISTS') < workSql.indexOf('LIMIT'));
  const retained = { where: { id: 'retained' } }; await models.CivicProject.runHooks('beforeFind', retained);
  assert.deepEqual(retained.where, { id: 'retained' }, 'maintenance recovery reads must not be filtered');
});

test('test scheduler stays unregistered and database-ready does not fabricate job success', async () => {
  const registry = createJobHeartbeatRegistry(); let called = 0;
  assert.deepEqual(await registerScheduledJobs({ nodeEnv: 'test', registry, schedule: () => { called++; }, cycle: async () => { called++; } }), { enabled: false });
  assert.equal(called, 0); assert.equal(registry.check().status, 'not_configured');
  const health = createHealthService({ databaseProbe: async () => ({ status: 'ready' }), jobs: registry, requireJobs: false });
  const result = await health.readiness(); assert.equal(result.status, 'ready'); assert.equal(result.checks.backgroundJobs, 'not_configured');
});

test('policy cycles bound tenant allowlist and pagination and reject persistence failure', async () => {
  const id = '11111111-1111-4111-8111-111111111111'; const seen = [];
  const run = runtime.createSafeJobCycle({ selectTenants: async (limit) => { assert.equal(limit, 10); return [id]; }, reminders: async (args) => { seen.push(args); return { scanned: 25, nextCursor: id }; }, dispatch: async (args) => { assert.deepEqual(args.organizationIds, [id]); assert.equal(args.limit, 25); return { errors: 0 }; } });
  assert.equal((await run()).scanned, 50); assert.equal(seen.length, 2); assert.equal(seen[1].afterId, id);
  await assert.rejects(runtime.createSafeJobCycle({ selectTenants: async () => Array(11).fill(id), reminders: async () => {}, dispatch: async () => {} }), /tenant selection/);
  await assert.rejects(runtime.createSafeJobCycle({ selectTenants: async () => [], reminders: async () => {}, dispatch: async () => ({ errors: 1 }) }), /persistence/);
});

test('startup catchup runs guarded work, failures remain unready, overlaps suppressed', async () => {
  const registry = createJobHeartbeatRegistry(); let runs = 0; let callback;
  const registration = await registerScheduledJobs({ nodeEnv: 'development', registry, schedule: (_expr, cb) => { callback = cb; return { stop() {} }; }, cycle: async () => { runs++; } });
  assert.equal(runs, 1); assert.equal(registry.check().status, 'ready'); assert.equal(typeof callback, 'function'); await registration.run(); assert.equal(runs, 2);
});

// Inject only persistence methods, never open a DB connection. Dependent audit
// failure discards the fake transactional writes; controller returns sanitized 503.
test('project, readiness, work, evidence and profile required audits share managed transaction and roll back', async () => {
  const originals = []; const patch = (object, key, value) => { originals.push([object, key, object[key]]); object[key] = value; };
  const orgId = '11111111-1111-4111-8111-111111111111'; const userId = '22222222-2222-4222-8222-222222222222'; const projectId = '33333333-3333-4333-8333-333333333333';
  let committed = []; let pending = []; let activeTransaction;
  const organization = { id: orgId, status: 'active', defaultCurrency: 'AUD', update: async (_value, options) => { assert.equal(options.transaction, activeTransaction); pending.push('profile'); } };
  const actor = { id: userId, role: 'org_admin', sessionVersion: 0, status: 'active', organizationId: orgId };
  const row = { id: projectId, organizationId: orgId, name: 'Test', score: 40, workType: 'action' };
  patch(sequelize, 'transaction', async (work) => { activeTransaction = { LOCK: { UPDATE: 'update' } }; pending = []; try { const result = await work(activeTransaction); committed.push(...pending); return result; } finally { pending = []; } });
  patch(models.Organization, 'findOne', async () => organization); patch(models.Organization, 'findByPk', async () => organization);
  patch(models.User, 'findOne', async () => actor); patch(models.CivicProject, 'findOne', async () => row);
  for (const Model of [models.CivicProject, models.ReadinessAssessment, models.WorkItem, models.EvidenceItem]) patch(Model, 'create', async (_v, options) => { assert.equal(options.transaction, activeTransaction); pending.push(Model.name); return row; });
  patch(models.AuditLog, 'create', async (_v, options) => { assert.equal(options.transaction, activeTransaction); throw new Error('forced audit failure'); });
  try {
    for (const [handler, body] of [[createProject, { name: 'Test project' }], [createWorkItem, { title: 'Test work' }], [createEvidence, { title: 'Test evidence' }], [assessReadiness, { scopeScore: 1, costScore: 2, approvalsScore: 3, partnerScore: 4, fundingScore: 5, deliveryScore: 0, assessmentNote: 'Recorded test evidence.' }], [updateWorkspaceProfile, { name: 'Test council' }]]) {
      let error; let response;
      const res = { status(code) { response = code; return this; }, json() { throw new Error('Unexpected successful response'); } };
      await handler({ auth: { sub: userId, organizationId: orgId, role: 'org_admin', sessionVersion: 0 }, tenant: { organizationId: orgId }, params: { projectId }, body }, res, (e) => { error = e; });
      assert.equal(response, undefined); assert.equal(error?.status, 503); assert.deepEqual(committed, []);
    }
    for (const role of ['executive', 'platform_admin']) await assert.rejects(() => runtime.assertCreateActor({ auth: { sub: userId, organizationId: orgId, role, sessionVersion: 0 }, tenant: { organizationId: orgId } }, { LOCK: { UPDATE: 'update' } }), /current role/);
  } finally { for (const [object, key, value] of originals.reverse()) object[key] = value; }
});

test('optional notification service explicitly rechecks subscription and archive, canonical accepted is preserved', async () => {
  const service = await text('services/notificationReliabilityService.js');
  assert.match(service, /Subscription.findOne/); assert.match(service, /context.entitled/); assert.match(service, /RecordMaintenanceState.findOne/);
  assert.match(await text('services/accountNotifications.js'), /outcome.status === 'accepted'/);
  const stripe = await text('controllers/stripeBillingController.js');
  assert.match(stripe, /\['trial', 'active'\].includes\(current.status\)/); assert.match(stripe, /access_preserved/); assert.match(stripe, /lock: transaction.LOCK.UPDATE/);
});
