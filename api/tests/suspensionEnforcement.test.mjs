import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import Joi from 'joi';
import { organizationAccessDecision, sessionMatchesUser, requestAudience } from '../src/services/tenantAccessPolicy.js';
import { createTenantAuthentication } from '../src/services/tenantAuthentication.js';
import { createTenantAuthController } from '../src/services/tenantAuthController.js';
import { createTenantStateChanger } from '../src/services/tenantStateChange.js';

const tenantId = '10000000-0000-4000-8000-000000000001';
const otherId = '10000000-0000-4000-8000-000000000002';
const actorId = '10000000-0000-4000-8000-000000000003';
function response() {
  return { statusCode: 200, body: null, cookies: {}, cleared: [],
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    cookie(name, value, options) { this.cookies[name] = { value, options }; return this; },
    clearCookie(name) { this.cleared.push(name); return this; },
    send() { return this; },
  };
}
async function invoke(handler, req) {
  const res = response();
  let nextCalled = false;
  await handler(req, res, (error) => { if (error) throw error; nextCalled = true; });
  return { res, nextCalled };
}
function store({ orgStatus = 'active', role = 'contributor', sessionVersion = 0, mfaEnabled = false } = {}) {
  const state = {
    organization: { id: tenantId, name: 'Test Council', organisationType: 'council', status: orgStatus, isDemo: false },
    user: { id: 'test-user', organizationId: tenantId, role, status: 'active', sessionVersion, mfaEnabled, email: 'user@example.com', passwordHash: 'test-only-hash' },
    subscription: { organizationId: tenantId, status: 'active', endsAt: null },
    audits: [], subscriptionReads: 0,
  };
  function instance() {
    return { ...structuredClone(state.user), async update(changes) {
      Object.assign(state.user, changes); Object.assign(this, changes);
      if (state.concurrentVersionChange) { state.user.sessionVersion++; state.concurrentVersionChange = false; }
      if (state.concurrentSuspension) { state.organization.status = 'suspended'; state.concurrentSuspension = false; }
      return this;
    } };
  }
  const User = { async findByPk(id) { return id === state.user.id ? instance() : null; },
    async findOne({ where }) { return where.email === state.user.email && where.status === state.user.status ? instance() : null; } };
  const Organization = { async findByPk(id) { return id === tenantId ? structuredClone(state.organization) : null; } };
  const Subscription = { async findOne({ where }) { state.subscriptionReads++; return where.organizationId === tenantId ? structuredClone(state.subscription) : null; } };
  const AuditLog = { async create(data) { state.audits.push(data); return data; } };
  const env = { jwtSecret: 'unit-test-signing-key-not-a-deployment-secret', jwtExpiresIn: '1h', isProduction: false, privilegedActionMinutes: 10, mfaIssuer: 'Test' };
  const controller = createTenantAuthController({ jwt, Joi, bcrypt: { compare: async (password) => password === 'test-password' }, User, Organization, Subscription, AuditLog, ProductPlan: {}, env,
    decryptConfiguration: (value) => value, encryptConfiguration: (value) => value,
    createTotpSecret: () => ({ base32: 'TEST-ONLY' }), buildOtpauthUrl: () => 'otpauth://test', createQrCode: async () => 'data:test', verifyTotp: ({ code }) => code === '123456',
    createRecoveryCodes: () => ['test-recovery-code'], hashRecoveryCodes: async (codes) => codes,
    consumeRecoveryCode: async (code, codes) => ({ valid: codes.includes(code), remaining: codes.filter((item) => item !== code) }) });
  const middleware = createTenantAuthentication({ verifyToken: (token) => jwt.verify(token, env.jwtSecret), User, Organization, Subscription });
  function token(extra = {}) { return jwt.sign({ sub: state.user.id, organizationId: tenantId, role: state.user.role, sessionVersion: state.user.sessionVersion, ...extra }, env.jwtSecret); }
  return { state, middleware, controller, token };
}
const loginRequest = () => ({ body: { email: 'user@example.com', password: 'test-password' }, ip: '127.0.0.1' });
function protectedRequest(token, path = '/projects', extra = {}) {
  return { headers: { authorization: `Bearer ${token}` }, baseUrl: '/v1', path, method: 'GET', ...extra };
}

test('active subscription never permits new login for suspended, closed, inactive, missing or unknown tenant', async () => {
  for (const orgStatus of ['suspended', 'closed', 'inactive', null, 'unrecognised']) {
    const { controller, state } = store({ orgStatus });
    const { res } = await invoke(controller.login, loginRequest());
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'tenant_access_unavailable');
    assert.deepEqual(res.cookies, {});
    assert.equal(state.subscriptionReads, 0);
  }
  const { state } = store();
  assert.equal(organizationAccessDecision(state.user, null).allowed, false);
  const missing = store();
  missing.state.organization = null;
  assert.equal((await invoke(missing.controller.login, loginRequest())).res.statusCode, 403);
  assert.equal((await invoke(missing.middleware.requireAuth, protectedRequest(missing.token()))).res.statusCode, 403);
});

test('current full session is denied across tenant APIs, billing and support before data handlers', async () => {
  const fixture = store();
  const session = fixture.token();
  const before = await invoke(fixture.middleware.requireAuth, protectedRequest(session));
  assert.equal(before.nextCalled, true);
  fixture.state.organization.status = 'suspended';
  for (const path of ['/projects', '/strategies', '/billing/subscription', '/billing/customer-portal', '/support/contact-challenge', '/support/contact-enquiries']) {
    const { res, nextCalled } = await invoke(fixture.middleware.requireAuth, protectedRequest(session, path));
    assert.equal(res.statusCode, 403, path);
    assert.equal(nextCalled, false, path);
  }
  const entitlement = await invoke(fixture.middleware.requireActiveEntitlement, { auth: { sub: fixture.state.user.id, organizationId: tenantId, role: 'contributor' } });
  assert.equal(entitlement.res.statusCode, 403);
  assert.equal(fixture.state.subscriptionReads, 0);
});

test('restore rejects all prior versions and fresh login receives the current version', async () => {
  const fixture = store();
  const session = fixture.token();
  fixture.state.organization.status = 'suspended';
  fixture.state.user.sessionVersion++;
  assert.equal((await invoke(fixture.middleware.requireAuth, protectedRequest(session))).res.statusCode, 401);
  fixture.state.organization.status = 'active';
  fixture.state.user.sessionVersion++;
  assert.equal((await invoke(fixture.middleware.requireAuth, protectedRequest(session))).res.statusCode, 401);
  const fresh = await invoke(fixture.controller.login, loginRequest());
  assert.equal(fresh.res.statusCode, 200);
  const token = fresh.res.cookies.civicpath_session.value;
  assert.equal((await invoke(fixture.middleware.requireAuth, protectedRequest(token))).nextCalled, true);
});

test('suspension or session invalidation between password verification and issuance cannot mint a fresh session', async () => {
  for (const mutation of ['concurrentVersionChange', 'concurrentSuspension']) {
    const fixture = store();
    fixture.state[mutation] = true;
    const { res } = await invoke(fixture.controller.login, loginRequest());
    assert.equal(res.statusCode, mutation === 'concurrentVersionChange' ? 401 : 403);
    assert.deepEqual(res.cookies, {});
    assert.equal(fixture.state.audits.some((audit) => audit.action === 'auth_login_success'), false);
  }
});

test('full sessions reject cross-tenant, stale role, inactive user, absent version and pending scope claims', async () => {
  const fixture = store();
  for (const extra of [{ organizationId: otherId }, { role: 'org_admin' }, { sessionVersion: null }, { sessionVersion: 'NaN' }, { scope: 'mfa_pending', purpose: 'login' }]) {
    const { res, nextCalled } = await invoke(fixture.middleware.requireAuth, protectedRequest(fixture.token(extra)));
    assert.equal(res.statusCode, 401);
    assert.equal(nextCalled, false);
  }
  const session = fixture.token();
  fixture.state.user.role = 'org_admin';
  assert.equal((await invoke(fixture.middleware.requireAuth, protectedRequest(session))).res.statusCode, 401);
  fixture.state.user.status = 'disabled';
  assert.equal((await invoke(fixture.middleware.requireAuth, protectedRequest(fixture.token()))).res.statusCode, 401);
});

test('unauthenticated and wrong-role access are denied; tenant scope only uses authoritative identity', async () => {
  const fixture = store();
  assert.equal((await invoke(fixture.middleware.requireAuth, protectedRequest(''))).res.statusCode, 401);
  assert.equal((await invoke(fixture.middleware.requireRoles('platform_admin'), { auth: { role: 'contributor' } })).res.statusCode, 403);
  const req = { auth: { organizationId: tenantId, role: 'contributor' }, baseUrl: '/v1', method: 'GET', query: { organizationId: otherId }, body: { organizationId: otherId } };
  assert.equal((await invoke(fixture.middleware.tenantScope, req)).nextCalled, true);
  assert.deepEqual(req.tenant, { organizationId: tenantId });
  const readonly = await invoke(fixture.middleware.tenantScope, { ...req, auth: { organizationId: tenantId, role: 'executive' }, method: 'POST' });
  assert.equal(readonly.res.statusCode, 403);
  assert.equal(readonly.res.body.code, 'read_only_role');
});

test('platform admin must use MFA and operations; suspended council never grants tenant bypass', async () => {
  const fixture = store({ role: 'platform_admin', orgStatus: 'suspended' });
  const login = await invoke(fixture.controller.login, loginRequest());
  assert.equal(login.res.body.data.mfaRequired, true);
  assert.equal(login.res.body.data.setupRequired, true);
  assert.equal(login.res.body.data.operationsOnly, true);
  assert.equal(login.res.cookies.civicpath_session, undefined);
  const pending = login.res.cookies.civicpath_mfa_pending.value;
  assert.equal(login.res.cookies.civicpath_mfa_pending.options.maxAge, 600000);
  const pendingReq = { cookies: { civicpath_mfa_pending: pending }, method: 'GET', baseUrl: '/v1/auth', path: '/mfa/pending' };
  assert.equal((await invoke(fixture.middleware.requireMfaPending, pendingReq)).nextCalled, true);
  fixture.state.user.mfaEnabled = true;
  const full = fixture.token({ scope: 'session' });
  assert.equal((await invoke(fixture.middleware.requireAuth, protectedRequest(full, '/customers', { baseUrl: '/v1/admin' }))).nextCalled, true);
  assert.equal((await invoke(fixture.middleware.requireAuth, protectedRequest(full, '/me', { baseUrl: '/v1/auth' }))).nextCalled, true);
  for (const path of ['/projects', '/admin-like', '/billing/subscription', '/support/contact-challenge']) {
    assert.equal((await invoke(fixture.middleware.requireAuth, protectedRequest(full, path))).res.body.code, 'platform_tenant_access_denied');
  }
  assert.equal((await invoke(fixture.middleware.requireActiveEntitlement, { auth: { sub: fixture.state.user.id, organizationId: tenantId, role: 'platform_admin' } })).res.statusCode, 403);
  assert.equal(requestAudience({ baseUrl: '/v1', path: '/admin/customers' }), 'tenant');
});

test('pending MFA cannot be used as full session and is invalidated on suspension/restore/password reset', async () => {
  const fixture = store({ role: 'platform_admin', mfaEnabled: true });
  const token = fixture.token({ scope: 'mfa_pending', purpose: 'login' });
  const pendingReq = { cookies: { civicpath_mfa_pending: token } };
  assert.equal((await invoke(fixture.middleware.requireMfaPending, pendingReq)).nextCalled, true);
  assert.equal((await invoke(fixture.middleware.requireAuth, protectedRequest(token, '/customers', { baseUrl: '/v1/admin' }))).res.statusCode, 401);
  fixture.state.user.sessionVersion++;
  for (const orgStatus of ['suspended', 'active']) {
    fixture.state.organization.status = orgStatus;
    assert.equal((await invoke(fixture.middleware.requireMfaPending, pendingReq)).res.statusCode, 401);
  }
  fixture.state.user.role = 'contributor';
  assert.equal((await invoke(fixture.middleware.requireMfaPending, pendingReq)).res.statusCode, 401);
});

test('mandatory sysadmin MFA setup retries reuse secret and recovery codes remain supported', async () => {
  const fixture = store({ role: 'platform_admin' });
  const pendingToken = fixture.token({ scope: 'mfa_pending', purpose: 'setup' });
  const req = { auth: jwt.decode(pendingToken), body: { code: '123456' }, ip: '127.0.0.1' };
  const first = await invoke(fixture.controller.beginMfaSetup, req);
  const second = await invoke(fixture.controller.beginMfaSetup, req);
  assert.equal(first.res.body.data.manualKey, second.res.body.data.manualKey);
  const confirmed = await invoke(fixture.controller.confirmMfaSetup, req);
  assert.equal(confirmed.res.body.data.operationsOnly, true);
  assert.deepEqual(confirmed.res.body.data.recoveryCodes, ['test-recovery-code']);
  assert.ok(confirmed.res.cookies.civicpath_session);
  const loginToken = fixture.token({ scope: 'mfa_pending', purpose: 'login' });
  const recovery = await invoke(fixture.controller.verifyMfaLogin, { ...req, auth: jwt.decode(loginToken), body: { code: 'test-recovery-code' } });
  assert.equal(recovery.res.statusCode, 200);
  assert.deepEqual(fixture.state.user.mfaRecoveryCodes, []);
  const retry = await invoke(fixture.controller.verifyMfaLogin, { ...req, auth: jwt.decode(loginToken), body: { code: 'test-recovery-code' } });
  assert.equal(retry.res.statusCode, 401);
  assert.equal(sessionMatchesUser(jwt.decode(confirmed.res.cookies.civicpath_session.value), fixture.state.user), true);
});

function transactionalFixture(failure = null) {
  let data = { organization: { id: tenantId, status: 'active', organisationType: 'council', isDemo: false }, versions: [3, 7], events: [], audits: [] };
  const optionsSeen = [];
  const sequelize = { async transaction(work) {
    const transaction = { LOCK: { UPDATE: 'UPDATE' }, data: structuredClone(data) };
    const result = await work(transaction);
    data = transaction.data;
    return result;
  } };
  function validateOptions(options) { assert.ok(options.transaction); optionsSeen.push(options); return options.transaction.data; }
  const Organization = { async findOne(options) {
    const target = validateOptions(options);
    assert.equal(options.lock, 'UPDATE');
    if (options.where.id !== target.organization.id || !options.where.organisationType.includes(target.organization.organisationType)) return null;
    return { ...target.organization, async update(changes, opts) { Object.assign(validateOptions(opts).organization, changes); } };
  } };
  const User = { async increment(field, options) {
    assert.equal(field, 'sessionVersion'); assert.equal(options.where.organizationId, tenantId); assert.equal(options.by, 1);
    const target = validateOptions(options);
    if (failure === 'increment') throw new Error('injected session invalidation failure');
    target.versions = target.versions.map((version) => version + 1);
  } };
  const TenantStateEvent = { async create(event, options) {
    const target = validateOptions(options);
    if (failure === 'event') throw new Error('injected event failure');
    target.events.push(event);
  } };
  const AuditLog = { async create(audit, options) {
    const target = validateOptions(options);
    if (failure === 'audit') throw new Error('injected audit failure');
    target.audits.push(audit);
  } };
  const change = createTenantStateChanger({ sequelize, Organization, User, TenantStateEvent, AuditLog });
  return { change, get data() { return data; }, optionsSeen };
}
const changeRequest = () => ({ actor: { sub: 'platform-user', organizationId: actorId, role: 'platform_admin', elevatedAt: Date.now() }, customerId: tenantId, status: 'suspended', reason: 'A validated administrative decision.', ipAddress: '127.0.0.1' });

test('suspend and restore atomically update organization, all session versions, event and allowlisted audit', async () => {
  const fixture = transactionalFixture();
  const request = changeRequest();
  request.reason = 'password=fake-pasted-password token=fake-pasted-token';
  await fixture.change(request);
  assert.equal(fixture.data.organization.status, 'suspended');
  assert.deepEqual(fixture.data.versions, [4, 8]);
  assert.equal(fixture.data.events.length, 1);
  assert.equal(fixture.data.audits.length, 1);
  assert.doesNotMatch(JSON.stringify(fixture.data), /fake-pasted|password=|token=/);
  assert.deepEqual(Object.keys(fixture.data.audits[0].metadata).sort(), ['customerId', 'fromStatus', 'sessionsInvalidated', 'toStatus']);
  await fixture.change({ ...changeRequest(), status: 'active' });
  assert.deepEqual(fixture.data.versions, [5, 9]);
  assert.equal(fixture.data.audits.length, 2);
});

test('required audit, state-event and session increment failures roll back the complete suspension', async () => {
  for (const failure of ['audit', 'event', 'increment']) {
    const fixture = transactionalFixture(failure);
    await assert.rejects(() => fixture.change(changeRequest()), /injected/);
    assert.equal(fixture.data.organization.status, 'active');
    assert.deepEqual(fixture.data.versions, [3, 7]);
    assert.deepEqual(fixture.data.events, []);
    assert.deepEqual(fixture.data.audits, []);
  }
});

test('state change denies tenant roles, un-elevated admin, foreign IDs, invalid states and duplicate transitions', async () => {
  const fixture = transactionalFixture();
  for (const role of ['org_admin', 'portfolio_manager', 'contributor', 'executive']) {
    await assert.rejects(() => fixture.change({ ...changeRequest(), actor: { ...changeRequest().actor, role } }), { status: 403 });
  }
  await assert.rejects(() => fixture.change({ ...changeRequest(), actor: { ...changeRequest().actor, elevatedAt: null } }), { status: 428 });
  await assert.rejects(() => fixture.change({ ...changeRequest(), customerId: otherId }), { status: 404 });
  await assert.rejects(() => fixture.change({ ...changeRequest(), customerId: 'not-an-id' }), { status: 422 });
  await assert.rejects(() => fixture.change({ ...changeRequest(), status: 'closed' }), { status: 422 });
  await assert.rejects(() => fixture.change({ ...changeRequest(), status: 'active' }), { status: 422 });
  assert.equal(fixture.data.organization.status, 'active');
});
