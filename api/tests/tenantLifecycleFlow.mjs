// Run ONLY against the parent's explicitly isolated, migrated test database/API. Never auto-starts a daemon.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Avoid reading a local .env; the parent supplies the isolated harness configuration explicitly.
process.env.DOTENV_CONFIG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '__no_environment_file__');
if (process.env.LIFECYCLE_ISOLATED_TEST !== 'true' || process.env.NODE_ENV === 'production') throw new Error('Explicit LIFECYCLE_ISOLATED_TEST=true and non-production configuration are required.');
const { default: dotenv } = await import('dotenv');
const dotenvConfig = dotenv.config; dotenv.config = () => ({ parsed: {} });
const { env } = await import('../src/config/env.js');
dotenv.config = dotenvConfig;
const baseUrl = process.env.LIFECYCLE_TEST_BASE_URL || 'http://127.0.0.1:3017/v1';
const parsed = new URL(baseUrl);
if (!['127.0.0.1', 'localhost'].includes(parsed.hostname) || !/test/i.test(env.db.database)) throw new Error('Only a loopback API and a database name containing test are allowed.');
const { default: jwt } = await import('jsonwebtoken');
const { sequelize } = await import('../src/config/database.js');
const { Organization, User, CivicProject, StrategicPlan, StrategyAction, CollaborationThread, SupportCase, SupportAttachment, CustomerNote, IntegrationConnection, EvidenceItem, AuditLog, TenantStateEvent, CouncilInvitation } = await import('../src/models/index.js');
const { lifecycleModels } = await import('../src/models/tenantLifecycleModels.js');
const { TenantLifecycleState, TenantLifecycleRequest, TenantWorkspaceExport, TenantAttachmentRequest } = lifecycleModels;
const suffix = crypto.randomUUID().slice(0, 8); const tenants = []; const actors = []; const markers = [];
const marker = (name) => { const value = `${name}_${suffix}`; markers.push(value); return value; };
const tokenFor = (user, elevated = false) => jwt.sign({ sub: user.id, organizationId: user.organizationId, role: user.role, sessionVersion: user.sessionVersion || 0, ...(elevated ? { elevatedAt: Date.now() } : {}) }, env.jwtSecret, { expiresIn: '10m' });
async function request(pathname, { actor, method = 'GET', body, elevated = false, expected = 200, raw = false, token } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, { method, headers: { 'content-type': 'application/json', ...(actor || token ? { authorization: `Bearer ${token || tokenFor(actor, elevated)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await response.text(); assert.equal(response.status, expected, `${method} ${pathname} expected ${expected}, got ${response.status}`);
  if (raw) return { text, response }; const json = JSON.parse(text); return json.data || json;
}
async function createTenant(name) { const organization = await Organization.create({ name: `Lifecycle isolated ${name} ${suffix}`, slug: `lifecycle-${name}-${suffix}`, organisationType: 'council', status: 'active' }); tenants.push(organization.id); return organization; }
async function createUser(organizationId, role) { const actor = await User.create({ organizationId, email: `lifecycle-${role}-${crypto.randomUUID().slice(0, 8)}@example.invalid`, firstName: 'Isolated', lastName: 'Lifecycle', role, status: 'active', passwordHash: marker('PASSWORD_HASH'), mfaSecretEncrypted: { ciphertext: marker('MFA_SECRET') }, mfaRecoveryCodes: [marker('MFA_RECOVERY')] }); actors.push(actor.id); return actor; }
const approve = { decision: 'approve', note: 'Independent Council authority and preservation inventory verified in isolated test.', humanVerified: true, backupTreatmentVerified: true, objectVersionsVerified: true, approvalReference: 'ISOLATED-APPROVAL-001' };
try {
  await sequelize.authenticate();
  const own = await createTenant('own'); const other = await createTenant('other'); const platform = await createTenant('platform');
  const admin = await createUser(own.id, 'org_admin'); const contributor = await createUser(own.id, 'contributor'); const executive = await createUser(own.id, 'executive');
  const otherAdmin = await createUser(other.id, 'org_admin'); const platformAdmin = await createUser(platform.id, 'platform_admin');
  const foreignName = marker('OTHER_TENANT_PROJECT'); await CivicProject.create({ organizationId: other.id, name: foreignName });
  const project = await CivicProject.create({ organizationId: own.id, name: 'Council current project' });
  const strategy = await StrategicPlan.create({ organizationId: own.id, name: 'Council strategy' }); const action = await StrategyAction.create({ organizationId: own.id, strategyId: strategy.id, title: 'Council delivery action' });
  await CollaborationThread.create({ organizationId: own.id, resourceType: 'action', resourceId: action.id, body: 'Current collaboration retained.', createdBy: admin.id });
  const support = await SupportCase.create({ organizationId: own.id, requesterId: admin.id, title: 'Council support request', summary: 'Safe requester supplied summary.' });
  const attachment = await SupportAttachment.create({ organizationId: own.id, supportCaseId: support.id, originalFilename: 'council-evidence.pdf', contentType: 'application/pdf', sizeBytes: 20, checksumSha256: 'a'.repeat(64), storageProvider: 'local', storageKey: marker('PRIVATE_STORAGE_KEY') });
  const evidence = await EvidenceItem.create({ organizationId: own.id, projectId: project.id, title: 'Evidence metadata', evidenceType: 'document', storageKey: marker('PRIVATE_EVIDENCE_KEY'), externalUrl: `https://example.invalid/evidence?token=${marker('SIGNED_URL_TOKEN')}` });
  await CustomerNote.create({ organizationId: own.id, body: marker('INTERNAL_CUSTOMER_NOTE'), visibility: 'internal' });
  await IntegrationConnection.create({ organizationId: own.id, provider: 'custom', encryptedConfiguration: marker('PROVIDER_SECRET') });
  await AuditLog.create({ organizationId: own.id, entityType: 'fixture', action: 'fixture', metadata: { tokenHash: marker('AUDIT_TOKEN_HASH') }, ipAddress: '127.0.0.1' });
  await request('/tenant-lifecycle', { expected: 401 });
  await request('/tenant-lifecycle/exports', { actor: contributor, method: 'POST', body: {}, expected: 403 });
  await request('/tenant-lifecycle/exports', { actor: executive, method: 'POST', body: {}, expected: 403 });
  await request('/tenant-lifecycle', { actor: executive });
  // No subscriptions exist on this isolated tenant: recovery export must still work.
  const exported = await request('/tenant-lifecycle/exports', { actor: admin, method: 'POST', body: {}, expected: 201 }); assert.equal(exported.status, 'ready');
  await request(`/tenant-lifecycle/exports/${exported.id}`, { actor: otherAdmin, expected: 404 });
  await request(`/tenant-lifecycle/exports/${exported.id}/download`, { actor: otherAdmin, expected: 404 });
  const downloaded = await request(`/tenant-lifecycle/exports/${exported.id}/download`, { actor: admin, raw: true });
  assert.match(downloaded.response.headers.get('cache-control'), /no-store/);
  for (const secret of markers) assert.ok(!downloaded.text.includes(secret), 'An excluded marker was exposed.');
  const document = JSON.parse(downloaded.text); assert.equal(document.manifest.organizationId, own.id); assert.equal(document.manifest.complete, true);
  assert.equal(document.data.CivicProject[0].id, project.id); assert.equal(document.data.CollaborationThread.length, 1); assert.equal(document.data.SupportCase[0].summary, 'Safe requester supplied summary.');
  assert.equal(document.attachmentManifest[0].request.method, 'POST'); assert.ok(!document.attachmentManifest[0].url);
  assert.ok(!document.data.PlatformSetting); assert.ok(!document.data.User.some((row) => Object.keys(row).some((key) => /password|mfa|token|session/i.test(key))));
  await request('/tenant-lifecycle/attachment-requests', { actor: otherAdmin, method: 'POST', body: { kind: 'support', attachmentId: attachment.id }, expected: 404 });
  await request('/tenant-lifecycle/attachment-requests', { actor: admin, method: 'POST', body: { kind: 'support', attachmentId: attachment.id }, expected: 201 });
  assert.ok(await AuditLog.findOne({ where: { organizationId: own.id, entityId: exported.id, action: 'workspace_export_download_authorized' } }));
  const hold = await request('/tenant-lifecycle/requests', { actor: admin, method: 'POST', body: { kind: 'legal_hold', reason: 'Preserve records for legal proceeding.' }, expected: 201 });
  assert.equal((await TenantLifecycleState.findOne({ where: { organizationId: own.id } })).holdActive, true);
  await request(`/admin/tenant-lifecycle/${own.id}/requests/${hold.id}/review`, { actor: admin, method: 'POST', body: approve, elevated: true, expected: 403 });
  await request(`/admin/tenant-lifecycle/${own.id}/requests/${hold.id}/review`, { actor: platformAdmin, method: 'POST', body: approve, expected: 428 });
  await request(`/admin/tenant-lifecycle/${other.id}/requests/${hold.id}/review`, { actor: platformAdmin, method: 'POST', body: approve, elevated: true, expected: 404 });
  await request(`/admin/tenant-lifecycle/${own.id}/requests/${hold.id}/review`, { actor: platformAdmin, method: 'POST', body: approve, elevated: true });
  await request('/tenant-lifecycle/requests', { actor: admin, method: 'POST', body: { kind: 'closure', reason: 'End Council access now.' }, expected: 409 });
  const release = await request('/tenant-lifecycle/requests', { actor: admin, method: 'POST', body: { kind: 'release_hold', reason: 'Legal authority verified release request.' }, expected: 201 });
  await request(`/admin/tenant-lifecycle/${own.id}/requests/${release.id}/review`, { actor: platformAdmin, method: 'POST', body: approve, elevated: true });
  const retention = await request('/tenant-lifecycle/requests', { actor: admin, method: 'POST', body: { kind: 'retention', reason: 'Please establish approved retention policy.' }, expected: 201 });
  await request(`/admin/tenant-lifecycle/${own.id}/requests/${retention.id}/review`, { actor: platformAdmin, method: 'POST', body: approve, elevated: true, expected: 409 });
  const closure = await request('/tenant-lifecycle/requests', { actor: admin, method: 'POST', body: { kind: 'closure', reason: 'Close access while preserving council data.' }, expected: 201 }); const priorToken = tokenFor(admin);
  const closed = await request(`/admin/tenant-lifecycle/${own.id}/requests/${closure.id}/review`, { actor: platformAdmin, method: 'POST', body: approve, elevated: true }); assert.equal(closed.status, 'access_closed_data_preserved');
  assert.equal((await Organization.findByPk(own.id)).status, 'suspended'); assert.equal((await User.findByPk(admin.id)).status, 'disabled'); assert.equal((await User.findByPk(admin.id)).sessionVersion, 1);
  await request('/tenant-lifecycle', { token: priorToken, expected: 401 });
  assert.ok(await CivicProject.findByPk(project.id)); assert.ok(await SupportAttachment.findByPk(attachment.id)); assert.ok(await EvidenceItem.findByPk(evidence.id));
  console.info('Isolated lifecycle API flow passed: recovery export, negative role/tenant checks, no secret markers, audited private manifest, hold review and atomic access closure with data preserved.');
} finally {
  // Cleanup only UUIDs created by this explicit test in its isolated DB. No existing tenants/users are touched.
  if (tenants.length) {
    for (const model of [TenantAttachmentRequest, TenantWorkspaceExport, TenantLifecycleRequest, TenantLifecycleState, CouncilInvitation, CollaborationThread, SupportAttachment, SupportCase, CustomerNote, IntegrationConnection, EvidenceItem, CivicProject, StrategyAction, StrategicPlan, TenantStateEvent, AuditLog]) await model.destroy({ where: { organizationId: tenants }, force: true });
    await User.destroy({ where: { id: actors, organizationId: tenants }, force: true }); await Organization.destroy({ where: { id: tenants }, force: true });
  }
  await sequelize.close();
}
