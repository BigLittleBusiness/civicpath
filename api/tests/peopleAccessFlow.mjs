import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Op } from 'sequelize';
import { sequelize } from '../src/config/database.js';
import { AuditLog, CivicProject, CouncilInvitation, Organization, ProductPlan, Subscription, User } from '../src/models/index.js';
import { env } from '../src/config/env.js';
import { hashToken } from '../src/services/accountNotifications.js';

const baseUrl = process.env.PEOPLE_ACCESS_TEST_BASE_URL || 'http://127.0.0.1:3017/v1';
const suffix = crypto.randomUUID().slice(0, 8);
const email = `people-access-${suffix}@example.com`;
let organization;
let plan;
let administrator;
let invitedUser;
let project;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  assert.ok(response.ok, `${options.method || 'GET'} ${path} failed (${response.status}): ${body.error || JSON.stringify(body)}`);
  return body.data;
}
async function requestFailure(path, status, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  assert.equal(response.status, status, `${options.method || 'GET'} ${path} should fail with ${status}: ${JSON.stringify(body)}`);
  return body;
}
function authHeaders(user) {
  return { authorization: `Bearer ${jwt.sign({ sub: user.id, organizationId: user.organizationId, role: user.role, sessionVersion: user.sessionVersion }, env.jwtSecret, { expiresIn: '5m' })}` };
}
async function cleanup() {
  if (!organization) return;
  const userIds = (await User.findAll({ where: { organizationId: organization.id }, attributes: ['id'] })).map((user) => user.id);
  await Promise.all([
    CivicProject.destroy({ where: { organizationId: organization.id }, force: true }),
    CouncilInvitation.destroy({ where: { organizationId: organization.id }, force: true }),
    AuditLog.destroy({ where: { organizationId: organization.id }, force: true }),
  ]);
  if (userIds.length) await User.destroy({ where: { id: { [Op.in]: userIds } }, force: true });
  await Subscription.destroy({ where: { organizationId: organization.id }, force: true });
  await organization.destroy({ force: true });
  await plan.destroy({ force: true });
}

try {
  await sequelize.authenticate();
  plan = await ProductPlan.create({ code: `people-access-${suffix}`, name: 'People Access Test', product: 'civicpath', annualPriceAud: 1, workflowUserLimit: 2, activeProjectLimit: 1, activeGrantLimit: 1, features: {} });
  organization = await Organization.create({ name: `People Access Test Council ${suffix}`, slug: `people-access-${suffix}`, country: 'AU', organisationType: 'council', planCode: plan.code, status: 'active' });
  administrator = await User.create({ organizationId: organization.id, email: `admin-${suffix}@example.com`, firstName: 'Admin', lastName: 'Tester', passwordHash: await bcrypt.hash('PeopleAccessTestPassword!', 12), role: 'org_admin', status: 'active' });
  await Subscription.create({ organizationId: organization.id, planId: plan.id, status: 'active', entitlements: { civicpathCore: true } });
  const headers = authHeaders(administrator);

  const initial = await request('/workspace/members', { headers });
  assert.equal(initial.members.length, 1, 'Test workspace should begin with one administrator.');
  assert.equal(initial.seats.workflowSeatsAvailable, 1, 'The test plan should leave one available seat.');
  const profile = await request('/workspace/profile', { headers });
  assert.equal(profile.profile.name, organization.name, 'Organisation administrators can read the workspace profile.');
  const updatedProfile = await request('/workspace/profile', { method: 'PATCH', headers, body: JSON.stringify({ name: `${organization.name} Updated`, operatingContactName: 'Admin Tester', operatingContactRole: 'Economic Development', operatingContactEmail: administrator.email, workspaceOwnerId: administrator.id }) });
  assert.equal(updatedProfile.name, `${organization.name} Updated`, 'Organisation administrators can complete their workspace profile without platform support.');
  await requestFailure(`/workspace/members/${administrator.id}`, 422, { method: 'DELETE', headers, body: JSON.stringify({ reason: 'Must not remove final administrator.' }) });

  const invitation = await request('/workspace/members', { method: 'POST', headers, body: JSON.stringify({ firstName: 'Alex', lastName: 'Council', email, role: 'contributor' }) });
  assert.equal(invitation.member.status, 'invited');
  await requestFailure('/workspace/members', 422, { method: 'POST', headers, body: JSON.stringify({ firstName: 'Over', lastName: 'Limit', email: `over-limit-${suffix}@example.com`, role: 'contributor' }) });

  const afterInvite = await request('/workspace/members', { headers });
  invitedUser = afterInvite.members.find((member) => member.email === email);
  assert.ok(invitedUser, 'Invited member must be tenant-scoped and visible to the organisation administrator.');
  assert.equal(invitedUser.status, 'invited');
  await request(`/workspace/members/${invitedUser.id}/resend-invitation`, { method: 'POST', headers });

  const knownToken = `people-access-${crypto.randomBytes(24).toString('hex')}`;
  const invitationRecord = await CouncilInvitation.findOne({ where: { userId: invitedUser.id, consumedAt: null } });
  await invitationRecord.update({ tokenHash: hashToken(knownToken) });
  const invitationPreview = await request(`/auth/invitations/accept?token=${encodeURIComponent(knownToken)}`);
  assert.equal(invitationPreview.email, email);
  assert.equal(invitationPreview.role, 'contributor');
  await request('/auth/invitations/accept', { method: 'POST', body: JSON.stringify({ token: knownToken, password: 'AcceptedInvitationPassword!' }) });
  await requestFailure('/auth/invitations/accept', 422, { method: 'POST', body: JSON.stringify({ token: knownToken, password: 'AcceptedInvitationPassword!' }) });

  invitedUser = await User.findByPk(invitedUser.id);
  assert.equal(invitedUser.status, 'active');
  assert.equal(await bcrypt.compare('AcceptedInvitationPassword!', invitedUser.passwordHash), true, 'Invitation acceptance must set the chosen password.');
  project = await CivicProject.create({ organizationId: organization.id, ownerId: invitedUser.id, name: `People Access handover ${suffix}`, category: 'strategic_planning', stage: 'scoping' });
  await requestFailure(`/workspace/members/${invitedUser.id}`, 422, { method: 'DELETE', headers, body: JSON.stringify({ reason: 'Requires handover.' }) });
  await request(`/workspace/members/${invitedUser.id}/role`, { method: 'PATCH', headers, body: JSON.stringify({ role: 'org_admin' }) });
  await request(`/workspace/members/${invitedUser.id}`, { method: 'DELETE', headers, body: JSON.stringify({ reassignToUserId: administrator.id, reason: 'Controlled test handover.' }) });
  const reassignedProject = await CivicProject.findByPk(project.id);
  assert.equal(reassignedProject.ownerId, administrator.id, 'Active operational ownership must transfer before access is removed.');
  invitedUser = await User.findByPk(invitedUser.id);
  assert.equal(invitedUser.status, 'disabled');
  console.log('People & Access API flow passed.');
} finally {
  await cleanup();
  await sequelize.close();
}
