import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// This flow is opt-in, never part of node --test. It must be launched by an isolated
// harness with explicit environment settings, from an empty directory (no .env).
if (process.env.NODE_ENV !== 'test' || process.env.CIVICPATH_SUSPENSION_INTEGRATION !== '1') {
  throw new Error('Suspension integration requires NODE_ENV=test and CIVICPATH_SUSPENSION_INTEGRATION=1.');
}
if (!['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST)
  || !process.env.DB_PORT || process.env.DB_PORT === '3306'
  || !/(?:test|remediation)/i.test(process.env.DB_NAME || '')) {
  throw new Error('Suspension integration requires an explicitly configured loopback, non-default-port test/remediation DB.');
}
if (existsSync(resolve('.env'))) throw new Error('Run the isolated harness from a directory without an .env file.');
const baseUrl = new URL(process.env.CIVICPATH_TEST_URL || '');
if (!['127.0.0.1', 'localhost', '[::1]'].includes(baseUrl.hostname) || baseUrl.protocol !== 'http:' || baseUrl.pathname !== '/v1') {
  throw new Error('CIVICPATH_TEST_URL must be an explicit loopback HTTP API URL ending /v1.');
}
if (!process.env.JWT_SECRET || !process.env.PLATFORM_ENCRYPTION_KEY || !process.env.DB_USER || !process.env.DB_PASSWORD) {
  throw new Error('The isolated harness must supply explicit test-only JWT/encryption/database configuration.');
}
const [{ default: bcrypt }, { default: speakeasy }, { Op }, { sequelize }, models, { encryptConfiguration }, { createTenantStateChanger }] = await Promise.all([
  import('bcryptjs'), import('speakeasy'), import('sequelize'), import('../src/config/database.js'),
  import('../src/models/index.js'), import('../src/services/encryption.js'), import('../src/services/tenantStateChange.js'),
]);
const { Organization, User, Subscription, ProductPlan, AuditLog, TenantStateEvent } = models;
const suffix = crypto.randomUUID().slice(0, 8);
const organizations = [];
let plan;
const password = `test-${crypto.randomBytes(24).toString('base64url')}`;
const secret = speakeasy.generateSecret({ length: 20 }).base32;
const totp = () => speakeasy.totp({ secret, encoding: 'base32' });
const reason = 'Manual isolation test state change.';
const checks = [];
function passed(message) { checks.push(message); console.info(`PASS ${message}`); }
function client() {
  const cookies = new Map();
  return {
    cookies,
    async request(path, { method = 'GET', body, authorization } = {}) {
      const headers = { 'content-type': 'application/json' };
      if (cookies.size && !authorization) headers.cookie = [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
      if (authorization) headers.authorization = `Bearer ${authorization}`;
      const response = await fetch(`${baseUrl.href}${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
      for (const header of response.headers.getSetCookie()) {
        const pair = header.split(';')[0];
        const separator = pair.indexOf('=');
        const name = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (!value || /max-age=0/i.test(header) || /expires=Thu, 01 Jan 1970/i.test(header)) cookies.delete(name);
        else cookies.set(name, value);
      }
      return { status: response.status, body: response.status === 204 ? {} : await response.json() };
    },
  };
}
async function expect(clientInstance, path, status, options) {
  const result = await clientInstance.request(path, options);
  assert.equal(result.status, status, `${path} expected HTTP ${status}; received ${result.status}`);
  return result.body;
}
async function createOrganization(kind = 'council') {
  const organization = await Organization.create({ name: `Suspension Test ${suffix} ${organizations.length}`, slug: `suspension-test-${suffix}-${organizations.length}`, country: 'AU', organisationType: kind, status: 'active' });
  organizations.push(organization);
  return organization;
}
async function createUser(organization, role, mfa = false) {
  return User.create({ organizationId: organization.id, email: `suspension-${suffix}-${role}-${organization.id.slice(0, 8)}@example.com`, firstName: 'Suspension', lastName: 'Test', passwordHash: await bcrypt.hash(password, 12), role, status: 'active',
    ...(mfa ? { mfaEnabled: true, mfaRequired: true, mfaSecretEncrypted: encryptConfiguration({ secret }) } : {}) });
}
async function signIn(clientInstance, user, mfa = false) {
  const data = await expect(clientInstance, '/auth/login', 200, { method: 'POST', body: { email: user.email, password } });
  if (mfa) {
    assert.equal(data.data.mfaRequired, true);
    assert.equal(clientInstance.cookies.has('civicpath_session'), false, 'MFA challenge must not issue a full session');
    await expect(clientInstance, '/auth/mfa/verify-login', 200, { method: 'POST', body: { code: totp() } });
  }
  return data;
}
const rollbackHook = `suspension-audit-rollback-${suffix}`;
try {
  await sequelize.authenticate();
  const [platform, council, other] = [await createOrganization('platform'), await createOrganization(), await createOrganization()];
  plan = await ProductPlan.create({ code: `suspension-test-${suffix}`, name: `Suspension Test ${suffix}`, product: 'civicpath', annualPriceAud: 1, features: {}, isActive: true });
  for (const organization of [council, other]) await Subscription.create({ organizationId: organization.id, planId: plan.id, status: 'active', startsAt: new Date(), endsAt: new Date(Date.now() + 86400000) });
  const [operator, member, otherMember, executive, legacyAdmin] = [
    await createUser(platform, 'platform_admin', true), await createUser(council, 'org_admin'),
    await createUser(other, 'org_admin'), await createUser(council, 'executive'), await createUser(council, 'platform_admin', true),
  ];
  const operations = client();
  const tenant = client();
  const foreignTenant = client();
  const pending = client();
  const viewer = client();
  await signIn(operations, operator, true);
  await signIn(tenant, member);
  await signIn(foreignTenant, otherMember);
  await signIn(viewer, executive);
  await expect(tenant, '/workspace/profile', 200);
  await expect(operations, '/admin/customers', 200);
  for (const path of ['/workspace/profile', '/billing/subscription', '/support/contact-challenge']) await expect(operations, path, 403);
  await expect(tenant, `/admin/customers/${other.id}/status`, 403, { method: 'PATCH', body: { status: 'suspended', reason } });
  await expect(viewer, '/support/contact-enquiries', 403, { method: 'POST', body: {} });
  await expect(tenant, `/workspace/members/${otherMember.id}/role`, 404, { method: 'PATCH', body: { role: 'executive' } });
  passed('platform operations only; executive write, tenant role and cross-tenant member IDs denied');

  // A legacy/direct state write without invalidating sessions must still fail
  // closed at login and requireAuth. Only this randomly created test fixture is changed.
  await council.update({ status: 'suspended' });
  for (const [path, method] of [['/auth/me', 'GET'], ['/workspace/profile', 'GET'], ['/billing/subscription', 'GET'], ['/billing/customer-portal', 'POST'], ['/support/contact-challenge', 'GET'], ['/support/contact-enquiries', 'POST']]) {
    await expect(tenant, path, 403, { method, ...(method === 'POST' ? { body: {} } : {}) });
  }
  await expect(client(), '/auth/login', 403, { method: 'POST', body: { email: member.email, password } });
  assert.equal((await User.findByPk(member.id)).sessionVersion, 0);
  await council.update({ status: 'active' });
  passed('authoritative suspended organisation rejects APIs, billing, support and login even with unchanged token version');

  const tenantToken = tenant.cookies.get('civicpath_session');
  await expect(pending, '/auth/login', 200, { method: 'POST', body: { email: legacyAdmin.email, password } });
  const pendingToken = pending.cookies.get('civicpath_mfa_pending');
  await expect(pending, '/auth/mfa/pending', 200);
  await expect(pending, '/admin/customers', 401, { authorization: pendingToken });
  await expect(operations, `/admin/customers/${council.id}/status`, 428, { method: 'PATCH', body: { status: 'suspended', reason } });
  await expect(operations, '/auth/step-up', 200, { method: 'POST', body: { password, code: totp() } });
  await expect(operations, `/admin/customers/${council.id}/status`, 200, { method: 'PATCH', body: { status: 'suspended', reason } });
  assert.equal((await Organization.findByPk(council.id)).status, 'suspended');
  assert.equal((await Subscription.findOne({ where: { organizationId: council.id } })).status, 'active');
  assert.equal((await User.findByPk(member.id)).sessionVersion, 1);
  assert.equal((await User.findByPk(legacyAdmin.id)).sessionVersion, 1);
  for (const path of ['/auth/me', '/workspace/profile', '/billing/subscription', '/support/contact-challenge']) await expect(tenant, path, 401);
  await expect(client(), '/auth/login', 403, { method: 'POST', body: { email: member.email, password } });
  await expect(pending, '/auth/mfa/pending', 401);
  await expect(pending, '/auth/mfa/verify-login', 401, { method: 'POST', body: { code: totp() } });
  await expect(foreignTenant, '/workspace/profile', 200);
  passed('active subscription remains active, but suspension rejects new login, current token and pending MFA without affecting another tenant');

  // Recovery-only platform MFA remains permitted on a legacy suspended council.
  const recovery = client();
  await signIn(recovery, legacyAdmin, true);
  const recoverySession = recovery.cookies.get('civicpath_session');
  await expect(recovery, '/admin/customers', 200);
  await expect(recovery, '/workspace/profile', 403);
  await expect(recovery, '/billing/subscription', 403);
  await expect(operations, `/admin/customers/${council.id}/status`, 200, { method: 'PATCH', body: { status: 'active', reason } });
  assert.equal((await User.findByPk(member.id)).sessionVersion, 2);
  await expect(client(), '/auth/me', 401, { authorization: tenantToken });
  await expect(recovery, '/admin/customers', 401, { authorization: recoverySession });
  await expect(pending, '/auth/mfa/pending', 401);
  await signIn(tenant, member);
  await expect(tenant, '/workspace/profile', 200);
  passed('restore increments versions again, invalidates sessions issued during suspension and requires fresh login');

  // Real DB rollback, using the exact state-change service. No server debug route,
  // SQL trigger, schema edit or remote fault injection is installed.
  const beforeVersion = (await User.findByPk(member.id)).sessionVersion;
  const beforeEvents = await TenantStateEvent.count({ where: { organizationId: council.id } });
  const beforeAudits = await AuditLog.count({ where: { entityId: council.id, action: 'tenant_state_changed' } });
  AuditLog.addHook('beforeCreate', rollbackHook, (record) => {
    if (record.action === 'tenant_state_changed' && record.entityId === council.id) throw new Error('Injected suspension audit dependency failure.');
  });
  const changeState = createTenantStateChanger({ sequelize, Organization, User, TenantStateEvent, AuditLog });
  await assert.rejects(() => changeState({ actor: { sub: operator.id, organizationId: platform.id, role: 'platform_admin', elevatedAt: Date.now() }, customerId: council.id, status: 'suspended', reason, ipAddress: '127.0.0.1' }), /Injected suspension audit/);
  AuditLog.removeHook('beforeCreate', rollbackHook);
  assert.equal((await Organization.findByPk(council.id)).status, 'active');
  assert.equal((await User.findByPk(member.id)).sessionVersion, beforeVersion);
  assert.equal(await TenantStateEvent.count({ where: { organizationId: council.id } }), beforeEvents);
  assert.equal(await AuditLog.count({ where: { entityId: council.id, action: 'tenant_state_changed' } }), beforeAudits);
  await expect(tenant, '/workspace/profile', 200);
  passed('real DB audit failure rolls back tenant state, user versions, and tenant-state event');

  for (const audit of await AuditLog.findAll({ where: { entityId: council.id, action: 'tenant_state_changed' } })) {
    assert.deepEqual(Object.keys(audit.metadata).sort(), ['customerId', 'fromStatus', 'sessionsInvalidated', 'toStatus']);
  }
  passed('state-change audit contains only allowlisted non-secret metadata');
  console.info(`Suspension integration flow passed (${checks.length} groups).`);
} finally {
  AuditLog.removeHook('beforeCreate', rollbackHook);
  const ids = organizations.map((organization) => organization.id);
  if (ids.length) {
    await AuditLog.destroy({ where: { [Op.or]: [{ organizationId: { [Op.in]: ids } }, { entityId: { [Op.in]: ids } }] }, force: true });
    await TenantStateEvent.destroy({ where: { organizationId: { [Op.in]: ids } }, force: true });
    await Subscription.destroy({ where: { organizationId: { [Op.in]: ids } }, force: true });
    await User.destroy({ where: { organizationId: { [Op.in]: ids } }, force: true });
    for (const organization of organizations.reverse()) await organization.destroy({ force: true });
  }
  if (plan) await plan.destroy({ force: true });
  await sequelize.close();
}
