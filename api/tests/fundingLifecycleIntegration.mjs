// Run ONLY against the parent's isolated non-production DB/API after mounting the
// standalone router and applying migration 019. Creates and cleans its own tenants.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

if (process.env.FUNDING_INTEGRATION_ALLOW_WRITE !== '1' || process.env.NODE_ENV === 'production') {
  throw new Error('Set FUNDING_INTEGRATION_ALLOW_WRITE=1 in the isolated non-production test environment.');
}
const baseUrl = process.env.FUNDING_TEST_BASE_URL || 'http://127.0.0.1:3017/v1';
const target = new URL(baseUrl);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Integration writes are restricted to the parent local isolated API.');
const [{ sequelize }, models, { FundingLifecycleRecord }, { env }, jwtModule, sequelizeModule, { createFundingLifecycleHandlers }] = await Promise.all([
  import('../src/config/database.js'), import('../src/models/index.js'), import('../src/models/fundingLifecycle.js'),
  import('../src/config/env.js'), import('jsonwebtoken'), import('sequelize'), import('../src/services/fundingLifecycle.js'),
]);
const jwt = jwtModule.default; const { Op, literal } = sequelizeModule;
const { Organization, User, ProductPlan, Subscription, CivicProject, FundingPathway, Grant, EvidenceItem, WorkItem, AuditLog } = models;
const suffix = randomUUID().slice(0, 8); const tenants = []; let plan;
const allModels = { ...models, FundingLifecycleRecord };
const stamp = (record) => ({ version: record.version, updatedAt: record.updatedAt, reason: 'Isolated integration lifecycle check' });
function headers(user) {
  return { authorization: `Bearer ${jwt.sign({ sub: user.id, organizationId: user.organizationId, role: user.role, sessionVersion: user.sessionVersion }, env.jwtSecret, { expiresIn: '10m' })}` };
}
async function request(path, user, method = 'GET', body, expected = 200) {
  const response = await fetch(`${baseUrl}${path}`, { method, headers: { 'content-type': 'application/json', ...(user ? headers(user) : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  assert.equal(response.status, expected, `${method} ${path}: ${data.code || data.error || 'unexpected status'}`);
  return data;
}
async function tenant(country, currency) {
  const org = await Organization.create({ name: `Funding isolated ${country} ${suffix}`, slug: `funding-${country.toLowerCase()}-${suffix}`, country, defaultCurrency: currency, organisationType: 'council', status: 'active', planCode: plan.code });
  tenants.push(org.id);
  await Subscription.create({ organizationId: org.id, planId: plan.id, status: 'active', entitlements: { civicpathCore: true } });
  const users = {};
  for (const role of ['org_admin', 'portfolio_manager', 'contributor', 'executive']) users[role] = await User.create({ organizationId: org.id, email: `funding-${role}-${country}-${suffix}@example.com`, firstName: role, lastName: 'Tester', role, status: 'active', passwordHash: 'integration-unusable-login' });
  const project = await CivicProject.create({ organizationId: org.id, name: `Funding project ${suffix}`, ownerId: users.org_admin.id, currencyCode: currency, isSample: false });
  return { org, users, project };
}
async function cleanup() {
  for (const organizationId of tenants.reverse()) {
    // Strictly only generated fixture tenants; never mutate existing Council data.
    for (const model of [FundingLifecycleRecord, AuditLog, EvidenceItem, WorkItem, Grant, FundingPathway, CivicProject, User, Subscription]) await model.destroy({ where: { organizationId }, force: true });
    await Organization.destroy({ where: { id: organizationId }, force: true });
  }
  if (plan) await plan.destroy({ force: true });
}
try {
  await sequelize.authenticate();
  plan = await ProductPlan.create({ code: `funding-isolated-${suffix}`, name: 'Isolated Funding Lifecycle Test', product: 'civicpath', annualPriceAud: 0, features: {} });
  const a = await tenant('NZ', 'NZD'); const b = await tenant('AU', 'AUD');
  await request('/grants', null, 'GET', undefined, 401);
  let pathway = (await request('/funding-pathways', a.users.contributor, 'POST', { sourceName: `Manual pathway ${suffix}`, projectId: a.project.id, potentialAmount: '1000.50', sourceUrl: 'https://www.council.gov.au/source' }, 201)).data;
  assert.equal(pathway.provenance, 'council_entered'); assert.equal(pathway.currencyCode, 'NZD'); assert.equal(pathway.status, 'watching');
  assert.equal(pathway.enteredBy, a.users.contributor.id);
  pathway = (await request(`/funding-pathways/${pathway.id}`, a.users.portfolio_manager, 'PATCH', { ...stamp(pathway), status: 'preparing', note: 'Council assessed fit' })).data;
  assert.equal(pathway.status, 'preparing');
  let grant = (await request('/grants', a.users.org_admin, 'POST', { title: `Manual grant ${suffix}`, funder: 'Council-entered funder', projectId: a.project.id, fundingPathwayId: pathway.id, leadId: a.users.contributor.id, requestedAmount: '9999.99', dueDate: '2027-01-01', acquittalDueDate: '2027-12-31', sourceUrl: 'https://www.council.gov.au/source' }, 201)).data;
  assert.equal(grant.provenance, 'council_entered'); assert.equal(grant.currencyCode, 'NZD'); assert.equal(grant.status, 'identified');
  assert.equal(Object.hasOwn(grant, 'progress'), false);
  const evidence = await EvidenceItem.create({ organizationId: a.org.id, projectId: a.project.id, title: `Evidence ${suffix}`, evidenceType: 'link', externalUrl: 'https://www.council.gov.au/evidence', source: 'Council-entered', isVerified: false });
  const work = await WorkItem.create({ organizationId: a.org.id, projectId: a.project.id, title: `Work ${suffix}`, status: 'not_started' });
  const first = grant;
  grant = (await request(`/grants/${grant.id}`, a.users.contributor, 'PATCH', { ...stamp(grant), status: 'assessing', notes: 'Council assessment', evidenceIds: [evidence.id], workItemIds: [work.id] })).data;
  assert.equal(grant.version, first.version + 1);
  await request(`/grants/${grant.id}`, a.users.contributor, 'PATCH', { ...stamp(first), notes: 'Stale sidecar edit' }, 409);
  await request(`/grants/${grant.id}`, a.users.contributor, 'PATCH', { ...stamp(grant), updatedAt: '2000-01-01T00:00:00.000Z', notes: 'Stale parent edit' }, 409);
  const detail = (await request(`/grants/${grant.id}`, a.users.executive)).data;
  assert.equal(detail.evidence[0].title, evidence.title); assert.equal(detail.workItems[0].title, work.title); assert.equal(detail.ownerName, 'contributor Tester');
  for (const action of [['/grants', 'POST', { title: 'Denied', funder: 'Denied' }], [`/grants/${grant.id}`, 'PATCH', { ...stamp(grant), notes: 'Denied' }], [`/grants/${grant.id}/archive`, 'POST', stamp(grant)], ['/funding-pathways', 'POST', { sourceName: 'Denied', projectId: a.project.id }], [`/funding-pathways/${pathway.id}`, 'PATCH', { ...stamp(pathway), note: 'Denied' }]]) await request(action[0], a.users.executive, action[1], action[2], 403);
  for (const path of [`/grants/${grant.id}`, `/funding-pathways/${pathway.id}`]) await request(path, b.users.org_admin, 'GET', undefined, 404);
  await request(`/grants/${grant.id}`, b.users.org_admin, 'PATCH', { ...stamp(grant), notes: 'Cross tenant denied' }, 404);
  for (const extra of [{ projectId: b.project.id }, { leadId: b.users.org_admin.id }, { evidenceIds: [randomUUID()] }, { workItemIds: [randomUUID()] }]) await request(`/grants/${grant.id}`, a.users.org_admin, 'PATCH', { ...stamp(grant), ...extra }, 422);
  await request(`/grants/${grant.id}`, a.users.org_admin, 'PATCH', { ...stamp(grant), status: 'contracted' }, 409);
  for (const status of ['preparing', 'submitted', 'awarded', 'contracted', 'acquitting', 'acquitted']) {
    grant = (await request(`/grants/${grant.id}`, a.users.portfolio_manager, 'PATCH', { ...stamp(grant), status, awardedAmount: '5000.01' })).data;
    assert.equal(grant.status, status);
  }
  for (const [path, initial] of [[`/grants/${grant.id}`, grant], [`/funding-pathways/${pathway.id}`, pathway]]) {
    const archived = (await request(`${path}/archive`, a.users.org_admin, 'POST', stamp(initial))).data;
    assert.ok(archived.archivedAt); assert.equal(archived.status, initial.status);
    await request(`${path}/archive`, a.users.org_admin, 'POST', stamp(archived), 409);
    await request(`${path}/reactivate`, a.users.executive, 'POST', stamp(archived), 403);
    const activeList = (await request(`${path.split('/').slice(0, 2).join('/')}?archive=active`, a.users.executive)).data;
    assert.ok(!activeList.some((record) => record.id === initial.id));
    const archivedList = (await request(`${path.split('/').slice(0, 2).join('/')}?archive=archived`, a.users.executive)).data;
    assert.ok(archivedList.some((record) => record.id === initial.id));
    const reactivated = (await request(`${path}/reactivate`, a.users.contributor, 'POST', stamp(archived))).data;
    assert.equal(reactivated.archivedAt, null); assert.equal(reactivated.status, initial.status);
  }
  const csvResponse = await fetch(`${baseUrl}/grants/export.csv`, { headers: headers(a.users.executive) }); assert.equal(csvResponse.status, 200);
  const csv = await csvResponse.text(); assert.ok(csv.includes('"NZD"')); assert.ok(csv.includes('"5000.01"')); assert.ok(csv.includes('council_entered'));
  const history = (await request(`/grants/${grant.id}/history`, a.users.executive)).data;
  assert.ok(history.some((entry) => entry.action === 'created')); assert.ok(history.some((entry) => entry.action === 'archived')); assert.ok(history.some((entry) => entry.action === 'reactivated'));
  assert.equal(await Grant.count({ where: { organizationId: b.org.id } }), 0);
  // Real database rollback without patching global AuditLog or starting another API.
  const failing = createFundingLifecycleHandlers({ sequelize, models: allModels, Op, literal, audit: async () => { throw new Error('forced test audit rollback'); } });
  for (const kind of ['Grant', 'Pathway']) {
    const title = `Must rollback ${kind} ${suffix}`; let forwarded;
    await failing[`create${kind}`]({ auth: { sub: a.users.org_admin.id, organizationId: a.org.id }, tenant: { organizationId: a.org.id }, params: {}, body: kind === 'Grant' ? { title, funder: 'Rollback check' } : { sourceName: title, projectId: a.project.id } }, { status() { return this; }, json() { throw new Error('Unexpected successful rollback response'); } }, (error) => { forwarded = error; });
    assert.ok(forwarded); assert.equal(await (kind === 'Grant' ? Grant : FundingPathway).count({ where: { organizationId: a.org.id, [kind === 'Grant' ? 'title' : 'sourceName']: title } }), 0);
  }
  // Legacy records retain unknown provenance even after a real edit; no fabricated origin.
  const legacy = await Grant.create({ organizationId: a.org.id, title: `Legacy ${suffix}`, funder: 'Legacy unknown', currencyCode: 'NZD', isSample: false });
  let legacyView = (await request(`/grants/${legacy.id}`, a.users.executive)).data; assert.equal(legacyView.provenance, 'legacy_unverified'); assert.equal(legacyView.version, 0);
  legacyView = (await request(`/grants/${legacy.id}`, a.users.org_admin, 'PATCH', { ...stamp(legacyView), notes: 'Legacy updated without relabeling origin' })).data;
  assert.equal(legacyView.provenance, 'legacy_unverified');
  console.info('Funding lifecycle isolated integration passed: tenant/role boundaries, manual provenance, decimal currency, edit conflicts, transitions, archival, links, CSV and real DB audit rollback.');
} finally {
  try { await cleanup(); } finally { await sequelize.close(); }
}
