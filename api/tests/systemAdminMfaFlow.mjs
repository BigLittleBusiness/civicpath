import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import { Op } from 'sequelize';
import { sequelize } from '../src/config/database.js';
import { AuditLog, Organization, PasswordResetToken, User } from '../src/models/index.js';
import { hashToken } from '../src/services/accountNotifications.js';

if (process.env.NODE_ENV === 'production') throw new Error('System Administrator MFA flow tests must not run against production.');

const baseUrl = process.env.CIVICPATH_TEST_URL || 'http://127.0.0.1:3017/v1';
const suffix = crypto.randomUUID().slice(0, 12);
let password = `test-${crypto.randomBytes(30).toString('base64url')}`;
const email = `system-admin-mfa-${suffix}@example.com`;
let cookie = '';
let organization;
let administrator;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(options.headers || {}) } });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const body = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(`${path}: ${body.error || response.status}`);
  return body;
}

async function requestFailure(path, expectedStatus, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(options.headers || {}) } });
  const body = response.status === 204 ? {} : await response.json().catch(() => ({}));
  assert.equal(response.status, expectedStatus, `${path} should fail with ${expectedStatus}: ${body.error || JSON.stringify(body)}`);
  return body;
}

async function cleanup() {
  if (!organization) return;
  await AuditLog.destroy({ where: { organizationId: organization.id }, force: true });
  await PasswordResetToken.destroy({ where: { userId: administrator?.id }, force: true });
  await User.destroy({ where: { organizationId: organization.id }, force: true });
  await organization.destroy({ force: true });
}

try {
  await sequelize.authenticate();
  organization = await Organization.create({
    name: `System Administrator MFA Test ${suffix}`,
    slug: `system-admin-mfa-${suffix}`,
    country: 'AU',
    organisationType: 'council',
    status: 'active',
  });
  administrator = await User.create({
    organizationId: organization.id,
    email,
    firstName: 'System',
    lastName: 'Administrator',
    passwordHash: await bcrypt.hash(password, 12),
    role: 'platform_admin',
    status: 'active',
  });

  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(login.data?.mfaRequired, true, 'Platform admin must enter the MFA flow.');
  const pending = await request('/auth/mfa/pending');
  assert.equal(pending.data.purpose, 'setup', 'Fresh platform admins must enrol MFA.');
  const setup = await request('/auth/mfa/setup', { method: 'POST' });
  const firstCode = speakeasy.totp({ secret: setup.data.manualKey, encoding: 'base32' });
  const confirmed = await request('/auth/mfa/setup/verify', { method: 'POST', body: JSON.stringify({ code: firstCode }) });
  assert.ok(confirmed.data?.recoveryCodes?.length, 'MFA setup must issue recovery codes.');

  await request('/auth/logout', { method: 'POST' });
  const secondLogin = await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  assert.equal(secondLogin.data?.mfaRequired, true, 'MFA sign-in challenge must be required after enrolment.');
  const code = speakeasy.totp({ secret: setup.data.manualKey, encoding: 'base32' });
  const verified = await request('/auth/mfa/verify-login', { method: 'POST', body: JSON.stringify({ code }) });
  assert.equal(verified.data?.user?.role, 'platform_admin', 'MFA sign-in must issue a System Administrator session.');

  const customers = await request('/admin/customers');
  assert.ok(Array.isArray(customers.data), 'Customer 360 must be available after MFA sign-in.');
  const customer = customers.data.find((item) => item.id === organization.id) || customers.data[0];
  assert.ok(customer, 'Customer 360 must return an accessible customer record.');
  const customerDetail = await request(`/admin/customers/${customer.id}`);
  assert.equal(customerDetail.data?.customer?.id, customer.id, 'Customer 360 detail must be available after MFA sign-in.');
  const blocked = await fetch(`${baseUrl}/admin/customers/${customer.id}/status`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ status: 'suspended', reason: 'Test must not change tenant state without privileged re-authentication.' }) });
  assert.equal(blocked.status, 428, 'Tenant state change must be blocked pending privileged re-authentication.');
  const elevated = await request('/auth/step-up', { method: 'POST', body: JSON.stringify({ password, code: speakeasy.totp({ secret: setup.data.manualKey, encoding: 'base32' }) }) });
  assert.ok(elevated.data?.elevatedUntil, 'Privileged-action elevation must be issued.');

  await request('/auth/logout', { method: 'POST' });
  await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  const resetToken = crypto.randomBytes(32).toString('hex');
  await PasswordResetToken.create({ userId: administrator.id, tokenHash: hashToken(resetToken), expiresAt: new Date(Date.now() + 5 * 60 * 1000) });
  const resetPassword = `test-${crypto.randomBytes(30).toString('base64url')}`;
  const reset = await fetch(`${baseUrl}/auth/password-reset/confirm`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: resetToken, password: resetPassword }) });
  assert.equal(reset.status, 200, 'Password reset must complete for the pending-MFA invalidation test.');
  password = resetPassword;
  await requestFailure('/auth/mfa/pending', 401);

  cookie = '';
  await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  administrator = await User.findByPk(administrator.id);
  await administrator.update({ status: 'disabled', sessionVersion: Number(administrator.sessionVersion || 0) + 1 });
  await requestFailure('/auth/mfa/pending', 401);

  console.info('System Administrator MFA flow passed.');
} finally {
  await cleanup();
  await sequelize.close();
}
