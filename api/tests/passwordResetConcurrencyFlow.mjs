import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { sequelize } from '../src/config/database.js';
import { AuditLog, Organization, PasswordResetToken, User } from '../src/models/index.js';
import { hashToken } from '../src/services/accountNotifications.js';

if (process.env.NODE_ENV === 'production') throw new Error('Password reset concurrency tests must not run against production.');

const baseUrl = process.env.CIVICPATH_TEST_URL || 'http://127.0.0.1:3017/v1';
const suffix = crypto.randomUUID().slice(0, 12);
const rawToken = crypto.randomBytes(32).toString('hex');
const firstPassword = `test-${crypto.randomBytes(30).toString('base64url')}`;
const secondPassword = `test-${crypto.randomBytes(30).toString('base64url')}`;
let organization;
let user;

async function reset(password) {
  const response = await fetch(`${baseUrl}/auth/password-reset/confirm`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: rawToken, password }),
  });
  return { status: response.status, body: await response.json().catch(() => ({})) };
}

async function cleanup() {
  if (!organization) return;
  await AuditLog.destroy({ where: { organizationId: organization.id }, force: true });
  await PasswordResetToken.destroy({ where: { userId: user?.id }, force: true });
  await User.destroy({ where: { organizationId: organization.id }, force: true });
  await organization.destroy({ force: true });
}

try {
  await sequelize.authenticate();
  organization = await Organization.create({
    name: `Password Reset Concurrency Test ${suffix}`,
    slug: `password-reset-${suffix}`,
    country: 'AU',
    organisationType: 'council',
    status: 'active',
  });
  user = await User.create({
    organizationId: organization.id,
    email: `password-reset-${suffix}@example.com`,
    firstName: 'Password',
    lastName: 'Reset',
    passwordHash: await bcrypt.hash(`test-${crypto.randomBytes(30).toString('base64url')}`, 12),
    role: 'contributor',
    status: 'active',
  });
  await PasswordResetToken.create({
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
  });

  const results = await Promise.all([reset(firstPassword), reset(secondPassword)]);
  assert.deepEqual(results.map((result) => result.status).sort((a, b) => a - b), [200, 422], 'A reset token must complete exactly once when submitted concurrently.');

  const refreshedUser = await User.findByPk(user.id);
  assert.equal(refreshedUser.sessionVersion, 1, 'Exactly one successful reset must invalidate existing sessions once.');
  assert.equal(await bcrypt.compare(firstPassword, refreshedUser.passwordHash) || await bcrypt.compare(secondPassword, refreshedUser.passwordHash), true, 'The successful request must set the final password.');
  const unconsumed = await PasswordResetToken.count({ where: { userId: user.id, consumedAt: null } });
  assert.equal(unconsumed, 0, 'No unconsumed reset token may remain after a successful reset.');
  const completions = await AuditLog.count({ where: { organizationId: organization.id, userId: user.id, action: 'password_reset_completed' } });
  assert.equal(completions, 1, 'Only one password reset completion must be audited.');

  console.info('Password reset concurrency flow passed.');
} finally {
  await cleanup();
  await sequelize.close();
}
