import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import jwt from 'jsonwebtoken';
import { env } from '../src/config/env.js';
import { sequelize } from '../src/config/database.js';
import { Organization, User, ProductPlan, Subscription, CivicProject, StrategicPlan, StrategyFocusArea, StrategyAction, ActionEvidenceLink, QuarterlyReportingPeriod, StrategyReportSnapshot } from '../src/models/index.js';

assert.equal(process.env.NODE_ENV, 'test');
assert.match(env.db.database, /^civicpath_test_[a-f0-9]+$/);
assert.equal(process.env.DB_PORT, '3317');
const base = process.env.CIVICPATH_TEST_URL;
assert.equal(base, 'http://127.0.0.1:3017/v1');
const suffix = crypto.randomBytes(6).toString('hex');
const triggers = new Set();
const token = (actor) => jwt.sign({ sub: actor.id, organizationId: actor.organizationId, role: actor.role, sessionVersion: actor.sessionVersion }, env.jwtSecret, { expiresIn: '10m' });
async function request(route, actor, method = 'GET', body, expected = 200) {
  const response = await fetch(base + route, { method, headers: { 'content-type': 'application/json', ...(actor ? { authorization: `Bearer ${token(actor)}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(15000) });
  const document = await response.json().catch(() => ({}));
  if (expected !== null) assert.equal(response.status, expected, `${method} ${route}: expected ${expected}, got ${response.status}, ${document.code || document.error || ''}`);
  return { status: response.status, data: document.data, document };
}
const preconditions = (record) => ({ expectedUpdatedAt: record.updatedAt, expectedVersion: record.maintenance.version });
async function trigger(name, condition) {
  assert.match(name, /^cp_test_fail_[a-f0-9_]+$/);
  // MySQL binary logging requires elevated trigger creation. Do not grant SUPER
  // to the application identity or weaken global MySQL security for this test.
  // The fixed loopback test socket and generated DB name are mandatory guards.
  assert.equal(env.db.host, '127.0.0.1');
  const ddl = `CREATE TRIGGER \`${name}\` BEFORE INSERT ON \`AuditLog\` FOR EACH ROW BEGIN IF ${condition} THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Isolated required audit failure'; END IF; END;`;
  const result = spawnSync('sudo', ['mysql', '--socket=/run/mysqld/civicpath-test.sock', `--database=${env.db.database}`], { input: `DELIMITER //\n${ddl}//\nDELIMITER ;\n`, encoding: 'utf8' });
  assert.equal(result.status, 0, 'Isolated administrative trigger creation must succeed without granting application SUPER privileges.');
  triggers.add(name);
}
async function drop(name) { await sequelize.query(`DROP TRIGGER IF EXISTS \`${name}\``); triggers.delete(name); }
try {
  const plan = await ProductPlan.create({ code: `maintenance-${suffix}`, name: 'Isolated maintenance verification', product: 'civicpath', annualPriceAud: 5000, workflowUserLimit: 20, activeProjectLimit: 1000, activeGrantLimit: 1000, features: { strategyDelivery: true }, isActive: true });
  const org = await Organization.create({ name: 'Isolated maintenance council', slug: `maintenance-${suffix}`, country: 'AU', status: 'active', defaultCurrency: 'AUD' });
  const foreign = await Organization.create({ name: 'Foreign isolated council', slug: `foreign-maintenance-${suffix}`, country: 'NZ', status: 'active' });
  for (const organization of [org, foreign]) await Subscription.create({ organizationId: organization.id, planId: plan.id, status: 'active', endsAt: new Date(Date.now() + 31_536_000_000), entitlements: { strategyDelivery: true } });
  const actor = async (organizationId, role) => User.create({ organizationId, email: `${role}-${crypto.randomUUID()}@example.com`, firstName: 'Isolated', lastName: role, passwordHash: 'not-an-authenticatable-login', role, status: 'active' });
  const admin = await actor(org.id, 'org_admin'); const contributor = await actor(org.id, 'contributor'); const executive = await actor(org.id, 'executive'); const other = await actor(foreign.id, 'org_admin');
  const project = await CivicProject.create({ organizationId: org.id, ownerId: admin.id, name: 'Maintenance verification project', isSample: false });
  await request(`/maintenance/projects/${project.id}`, null, 'GET', undefined, 401);
  await request(`/maintenance/projects/${project.id}`, other, 'GET', undefined, 404);
  let current = (await request(`/maintenance/projects/${project.id}`, admin)).data;
  await request(`/projects/${project.id}`, executive, 'PATCH', { ...preconditions(current), changes: { name: 'Not allowed' } }, 403);
  await request(`/projects/${project.id}`, contributor, 'PATCH', { ...preconditions(current), changes: { name: 'Not allowed' } }, 403);
  await request(`/projects/${project.id}`, admin, 'PATCH', { changes: { name: 'Missing revision' } }, 428);
  const old = current;
  current = (await request(`/projects/${project.id}`, admin, 'PATCH', { ...preconditions(current), changes: { name: 'Correctly updated project' } })).data;
  await request(`/projects/${project.id}`, admin, 'PATCH', { ...preconditions(old), changes: { name: 'Stale overwrite' } }, 409);
  const competing = await Promise.all(['Concurrent A', 'Concurrent B'].map((name) => request(`/projects/${project.id}`, admin, 'PATCH', { ...preconditions(current), changes: { name } }, null)));
  assert.deepEqual(competing.map((result) => result.status).sort(), [200, 409], 'Only one competing maintenance write may commit.');
  current = (await request(`/maintenance/projects/${project.id}`, admin)).data;
  const savedName = (await project.reload()).name; const savedVersion = current.maintenance.version;
  const maintenanceTrigger = `cp_test_fail_${suffix}_a`;
  await trigger(maintenanceTrigger, `NEW.entity_id='${project.id}'`);
  const failedEdit = await request(`/projects/${project.id}`, admin, 'PATCH', { ...preconditions(current), changes: { name: 'Must roll back' } }, null);
  assert.ok(failedEdit.status >= 500); await drop(maintenanceTrigger);
  assert.equal((await project.reload()).name, savedName);
  assert.equal((await request(`/maintenance/projects/${project.id}`, admin)).data.maintenance.version, savedVersion, 'Required audit failure must roll back sidecar revision too.');
  current = (await request(`/maintenance/projects/${project.id}`, admin)).data;
  await request(`/maintenance/projects/${project.id}/archive`, admin, 'POST', { ...preconditions(current), reason: 'Isolated preservation test' });
  assert.ok(!(await request('/projects', admin)).data.some((row) => row.id === project.id), 'Archived project must disappear from the authoritative active portfolio.');
  const archived = (await request(`/maintenance/projects/${project.id}`, admin)).data;
  await request(`/maintenance/projects/${project.id}/restore`, admin, 'POST', preconditions(archived));
  assert.ok((await request('/projects', admin)).data.some((row) => row.id === project.id));

  const strategy = await StrategicPlan.create({ organizationId: org.id, name: 'Report integrity strategy', ownerId: admin.id, status: 'active' });
  const focus = await StrategyFocusArea.create({ organizationId: org.id, strategyId: strategy.id, title: 'Evidence focus', code: 'E' });
  const action = await StrategyAction.create({ organizationId: org.id, strategyId: strategy.id, focusAreaId: focus.id, actionCode: 'E1', title: 'Snapshot original action', ownerId: admin.id, status: 'planned' });
  const evidence = await ActionEvidenceLink.create({ organizationId: org.id, actionId: action.id, title: 'Recorded evidence', evidenceType: 'link', source: 'Isolated council source' });
  const period = await QuarterlyReportingPeriod.create({ organizationId: org.id, strategyId: strategy.id, label: 'Integrity quarter', financialYear: '2026-27', quarter: 'Q1', startsOn: '2026-07-01', endsOn: '2026-09-30', status: 'open' });
  let report = (await request(`/reports/periods/${period.id}`, admin)).data;
  assert.equal(report.summary.evidenceCoverage, 100);
  const source = (await request(`/maintenance/action-evidence/${evidence.id}`, admin)).data;
  await request(`/maintenance/action-evidence/${evidence.id}/archive`, admin, 'POST', { ...preconditions(source), reason: 'Isolated archived evidence' });
  report = (await request(`/reports/periods/${period.id}`, admin)).data;
  assert.equal(report.summary.evidenceCoverage, 0, 'Archived evidence cannot contribute to a current report.');
  await request(`/reports/periods/${period.id}`, contributor, 'GET', undefined, 403);
  await request(`/reports/periods/${period.id}/snapshots`, executive, 'POST', {}, 403);
  await request(`/reports/periods/${period.id}/snapshots`, admin, 'POST', { status: 'approved' }, 422);
  const snapshots = await Promise.all([request(`/reports/periods/${period.id}/snapshots`, admin, 'POST', {}, 201), request(`/reports/periods/${period.id}/snapshots`, admin, 'POST', {}, 201)]);
  assert.deepEqual(snapshots.map((item) => item.data.version).sort(), [1, 2], 'Real concurrent snapshots must allocate distinct monotonic versions.');
  const snapshot = snapshots[0].data;
  await request(`/reports/snapshots/${snapshot.id}`, other, 'GET', undefined, 404);
  const actionCurrent = (await request(`/maintenance/actions/${action.id}`, admin)).data;
  await request(`/strategy-actions/${action.id}`, admin, 'PATCH', { ...preconditions(actionCurrent), changes: { title: 'Current action changed after capture' } });
  const historical = (await request(`/reports/snapshots/${snapshot.id}`, executive)).data;
  assert.equal(historical.content.actions[0].title, 'Snapshot original action');
  assert.equal((await request(`/reports/periods/${period.id}`, admin)).data.actions[0].title, 'Current action changed after capture');
  const snapshotTrigger = `cp_test_fail_${suffix}_b`;
  await trigger(snapshotTrigger, `NEW.organization_id='${org.id}' AND NEW.entity_type='strategy_report_snapshot'`);
  await request(`/reports/periods/${period.id}/snapshots`, admin, 'POST', {}, 503); await drop(snapshotTrigger);
  assert.equal(await StrategyReportSnapshot.count({ where: { organizationId: org.id, reportingPeriodId: period.id } }), 2, 'Snapshot+audit rollback must leave no unaudited snapshot.');
  for (const format of ['json', 'csv', 'html']) {
    const response = await fetch(`${base}/reports/snapshots/${snapshot.id}/download?format=${format}`, { headers: { authorization: `Bearer ${token(executive)}` } });
    assert.equal(response.status, 200); assert.match(response.headers.get('content-disposition'), /attachment/); assert.match(response.headers.get('cache-control'), /no-store/);
    const text = await response.text(); assert.ok(text.length > 50); assert.ok(!/passwordHash|mfaSecretEncrypted|storageKey/.test(text));
  }
  console.log('Maintenance/reporting real HTTP+MySQL gate passed: cohort/tenant denial, missing/stale revisions, competing-write409, audit rollback, archive/restore, recorded-evidence exclusion, immutable capture, concurrent version allocation and safe exports.');
} finally {
  for (const name of triggers) await drop(name);
  await sequelize.close();
  // The parent owns and removes this entire freshly generated disposable database.
}
