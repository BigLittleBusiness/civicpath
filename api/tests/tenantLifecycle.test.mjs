import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeActor, assertExecutionAllowed, collectTenantGraph, EXPORT_SCHEMA, LifecycleError, projectExportRow, reviewTransition, scrubJson } from '../src/services/tenantLifecyclePolicy.mjs';
import { createTenantLifecycleService } from '../src/services/tenantLifecycleService.mjs';
import { applyTenantLifecycleMigration } from '../db/migrations/020_tenant_lifecycle.mjs';

const orgId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'; const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'; const otherId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'; const recordId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const org = { id: orgId, organisationType: 'council', status: 'active' }; const user = { id: userId, organizationId: orgId, role: 'org_admin', status: 'active', sessionVersion: 2 }; const auth = { sub: userId, organizationId: orgId, role: user.role, sessionVersion: 2 };
const errorCode = (code) => (error) => error instanceof LifecycleError && error.code === code;
test('live active role and tenant checks allow recovery without entitlement and executive read only', () => {
  authorizeActor(auth, user, org, 'write');
  assert.throws(() => authorizeActor(null, user, org), errorCode('authentication_required'));
  assert.throws(() => authorizeActor({ ...auth, sessionVersion: 1 }, user, org), errorCode('authentication_required'));
  assert.throws(() => authorizeActor(auth, user, { ...org, id: otherId }), errorCode('tenant_not_found'));
  assert.throws(() => authorizeActor(auth, user, { ...org, status: 'suspended' }), errorCode('tenant_suspended'));
  for (const role of ['executive', 'contributor', 'portfolio_manager', 'platform_admin']) {
    const actor = { ...user, role }; const claims = { ...auth, role };
    if (role === 'executive') authorizeActor(claims, actor, org, 'read');
    assert.throws(() => authorizeActor(claims, actor, org, 'write'), errorCode('forbidden'));
  }
});
test('positive export allowlists exclude credential, storage, internal support/financial fields and settings', () => {
  const projected = projectExportRow('User', { ...user, passwordHash: 'PASSWORD_MARKER', mfaSecretEncrypted: 'MFA_MARKER', tokenHash: 'TOKEN_MARKER', email: 'tenant@example.invalid' }, orgId);
  assert.equal(projected.passwordHash, undefined); assert.equal(projected.sessionVersion, undefined); assert.equal(projected.mfaSecretEncrypted, undefined);
  const attachment = projectExportRow('SupportAttachment', { id: recordId, organizationId: orgId, storageKey: 'PRIVATE_KEY', originalFilename: 'evidence.pdf' }, orgId);
  assert.equal(attachment.storageKey, undefined);
  assert.ok(!EXPORT_SCHEMA.PlatformSetting && !EXPORT_SCHEMA.PasswordResetToken && !EXPORT_SCHEMA.BillingEvent && !EXPORT_SCHEMA.CouncilInvitation);
  assert.equal(EXPORT_SCHEMA.CustomerNote.where.visibility, 'handover');
  assert.ok(!EXPORT_SCHEMA.SupportCase.fields.includes('internalNote'));
  assert.ok(!EXPORT_SCHEMA.BillingRefund.fields.includes('adminNote'));
  assert.throws(() => projectExportRow('User', { ...user, organizationId: otherId }, orgId), errorCode('export_tenant_boundary_violation'));
});
test('nested JSON strips secret keys, foreign tenant objects and signed/private URLs', () => {
  const clean = scrubJson({ tokenHash: 'secret', mfa: 'secret', storage_key: 'private', nested: { password: 'secret', title: 'kept' }, foreign: { organizationId: otherId, text: 'other tenant' }, url: 'https://example.invalid/object?signature=secret', public: 'https://example.invalid/evidence' }, orgId);
  assert.deepEqual(clean, { nested: { title: 'kept' }, foreign: null, url: null, public: 'https://example.invalid/evidence' });
});
test('export traverses all pages, manifests every table and excludes foreign references', async () => {
  const schema = { User: EXPORT_SCHEMA.User, SupportAttachment: EXPORT_SCHEMA.SupportAttachment, SupportCase: EXPORT_SCHEMA.SupportCase };
  const rows = { User: [{ id: userId, organizationId: orgId }], SupportAttachment: [{ id: recordId, organizationId: orgId, supportCaseId: otherId, uploadedBy: otherId, originalFilename: 'file.pdf' }], SupportCase: [] };
  const visited = [];
  const result = await collectTenantGraph({ organizationId: orgId, schema, limits: { pageSize: 1, maxRows: 20, maxBytes: 10000, maxMilliseconds: 1000 }, repository: { readPage: async ({ name, cursor, limit }) => { visited.push(name); return rows[name].filter((row) => !cursor || row.id > cursor).slice(0, limit); } } });
  assert.equal(result.totalRows, 2); assert.equal(result.document.manifest.complete, true); assert.equal(result.document.manifest.tables.SupportCase.count, 0);
  assert.equal(result.document.data.SupportAttachment[0].uploadedBy, null); assert.equal(result.document.data.SupportAttachment[0].supportCaseId, null);
  assert.equal(result.document.attachmentManifest[0].request.method, 'POST'); assert.ok(!JSON.stringify(result.document).includes('storageKey'));
  assert.equal(visited.filter((name) => name === 'User').length, 2);
});
test('export aborts not truncates on row, byte, time and malformed cursor limits', async () => {
  const row = { id: userId, organizationId: orgId }; const schema = { User: EXPORT_SCHEMA.User }; const repository = { readPage: async () => [row] };
  await assert.rejects(collectTenantGraph({ organizationId: orgId, schema, repository, limits: { pageSize: 2, maxRows: 0, maxBytes: 10000, maxMilliseconds: 1000 } }), errorCode('export_resource_limit'));
  await assert.rejects(collectTenantGraph({ organizationId: orgId, schema, repository, limits: { pageSize: 2, maxRows: 100, maxBytes: 1, maxMilliseconds: 1000 } }), errorCode('export_resource_limit'));
  let clock = 0; await assert.rejects(collectTenantGraph({ organizationId: orgId, schema, repository, now: () => clock += 100, limits: { pageSize: 2, maxRows: 100, maxBytes: 10000, maxMilliseconds: 50 } }), errorCode('export_time_limit'));
  await assert.rejects(collectTenantGraph({ organizationId: orgId, schema, repository, limits: { pageSize: 1, maxRows: 100, maxBytes: 10000, maxMilliseconds: 1000 } }), errorCode('export_invalid_cursor'));
});
const approval = { decision: 'approve', note: 'Authority independently verified.', humanVerified: true, backupTreatmentVerified: true, objectVersionsVerified: true, approvalReference: 'LEGAL-TEST-001' };
test('review transitions enforce independent human approval, legal hold and disabled retention/erasure', () => {
  const request = { status: 'pending', kind: 'closure', requestedBy: userId };
  assert.throws(() => reviewTransition(request, approval, otherId, true), errorCode('legal_hold_blocks_closure'));
  assert.equal(reviewTransition(request, approval, otherId, false).status, 'access_closed_data_preserved');
  assert.throws(() => reviewTransition(request, approval, userId, false), errorCode('independent_reviewer_required'));
  assert.throws(() => reviewTransition(request, { ...approval, objectVersionsVerified: false }, otherId, false), errorCode('human_verification_required'));
  assert.throws(() => reviewTransition({ ...request, kind: 'retention' }, approval, otherId, false), errorCode('leadership_retention_policy_required'));
  assert.throws(() => reviewTransition({ ...request, status: 'rejected' }, approval, otherId, false), errorCode('invalid_transition'));
  assert.throws(() => assertExecutionAllowed({ holdActive: true }), errorCode('legal_hold_blocks_execution'));
  assert.throws(() => assertExecutionAllowed(), errorCode('lifecycle_execution_disabled'));
});
function fakeRepo({ failAudit = false, platform = false, holdActive = false } = {}) {
  let store = { holdActive, requests: [], audits: [], closed: false };
  const actor = platform ? { ...user, role: 'platform_admin' } : user;
  const repo = {
    transaction: async (work) => { const previous = structuredClone(store); try { return await work({}); } catch (error) { store = previous; throw error; } },
    user: async () => actor, organization: async () => org, state: async () => store,
    pendingRequest: async () => null, requestCount: async () => 0,
    createRequest: async (values) => { const row = { id: recordId, ...values }; store.requests.push(row); return row; },
    setHold: async (_state, active) => { store.holdActive = active; },
    audit: async (values) => { if (failAudit) throw new Error('dependent audit failure'); store.audits.push(values); },
    getRequest: async (_org, id) => store.requests.find((row) => row.id === id),
    updateRequest: async (record, values) => Object.assign(record, values),
    closeAccess: async () => { store.closed = true; },
    hasPendingHold: async () => false,
  };
  return { repo, actor, get store() { return store; } };
}
test('legal hold request preserves immediately and rolls back primary + hold if required audit fails', async () => {
  const fixture = fakeRepo(); const service = createTenantLifecycleService({ repository: fixture.repo });
  const row = await service.request(auth, orgId, { kind: 'legal_hold', reason: 'Preserve council records for proceeding.' });
  assert.equal(row.status, 'pending'); assert.equal(fixture.store.holdActive, true); assert.equal(fixture.store.audits.length, 1);
  await assert.rejects(service.request(auth, orgId, { kind: 'closure', reason: 'Close council access now.' }), errorCode('legal_hold_blocks_closure'));
  const failing = fakeRepo({ failAudit: true }); const failureService = createTenantLifecycleService({ repository: failing.repo });
  await assert.rejects(failureService.request(auth, orgId, { kind: 'legal_hold', reason: 'Preserve records now.' }), /dependent audit failure/);
  assert.equal(failing.store.requests.length, 0); assert.equal(failing.store.holdActive, false);
});
test('closure access and review/audit commit together; audit failure rolls everything back', async () => {
  for (const failAudit of [false, true]) {
    const fixture = fakeRepo({ platform: true, failAudit }); fixture.store.requests.push({ id: recordId, organizationId: orgId, kind: 'closure', requestedBy: otherId, status: 'pending' });
    const service = createTenantLifecycleService({ repository: fixture.repo }); const claims = { ...auth, role: 'platform_admin' };
    if (failAudit) { await assert.rejects(service.review(claims, orgId, recordId, approval), /dependent audit failure/); assert.equal(fixture.store.closed, false); assert.equal(fixture.store.requests[0].status, 'pending'); }
    else { await service.review(claims, orgId, recordId, approval); assert.equal(fixture.store.closed, true); assert.equal(fixture.store.requests[0].status, 'access_closed_data_preserved'); }
  }
});
test('attachment request rejects cross-tenant IDs and unsupported fields/durations', async () => {
  const fixture = fakeRepo(); fixture.repo.attachmentOwned = async () => false;
  const service = createTenantLifecycleService({ repository: fixture.repo });
  await assert.rejects(service.attachmentRequest(auth, orgId, { kind: 'support', attachmentId: otherId }), errorCode('attachment_not_found'));
  await assert.rejects(service.request(auth, orgId, { kind: 'retention', reason: 'Review policy.', retentionDays: 30 }), errorCode('invalid_fields'));
});
test('additive migration can be run twice without sync/drop/update or repeated DDL', async () => {
  const tables = {}; const calls = []; const queryInterface = {
    showAllTables: async () => Object.keys(tables), createTable: async (name, columns) => { calls.push('create'); tables[name] = { columns, indexes: [] }; },
    describeTable: async (name) => tables[name].columns, addColumn: async (name, column, definition) => { calls.push('column'); tables[name].columns[column] = definition; },
    showIndex: async (name) => tables[name].indexes, addIndex: async (name, _fields, definition) => { calls.push('index'); tables[name].indexes.push(definition); },
  };
  const definitions = { TenantLifecycleTest: { attributes: { id: { type: 'uuid' }, organizationId: { type: 'uuid' } }, indexes: [{ name: 'tenant_index', fields: ['organization_id'] }] } };
  await applyTenantLifecycleMigration({ queryInterface, definitions, dataTypes: { DATE: 'date' } });
  const first = calls.length; await applyTenantLifecycleMigration({ queryInterface, definitions, dataTypes: { DATE: 'date' } }); assert.equal(calls.length, first);
  delete tables.TenantLifecycleTest.columns.organization_id;
  await applyTenantLifecycleMigration({ queryInterface, definitions, dataTypes: { DATE: 'date' } }); assert.equal(calls.at(-1), 'column');
});

function exportFixture() {
  let store = { holdActive: false, exports: [], audits: [] }; let clock = 100000;
  const repo = {
    transaction: async (work) => { const previous = structuredClone(store); try { return await work({}); } catch (error) { store = previous; throw error; } },
    snapshot: async (work) => work({}), user: async () => user, organization: async (id) => ({ ...org, id }), state: async () => store,
    expireArtifacts: async () => {}, activeExport: async () => null, exportCount: async () => 0, readyExportCount: async () => 0,
    createExport: async (values) => { const row = { id: recordId, downloadCount: 0, ...values }; store.exports.push(row); return row; },
    getExport: async (organizationId, id) => store.exports.find((row) => row.id === id && row.organizationId === organizationId),
    updateExport: async (row, values) => Object.assign(row, values), exportSummary: (row) => ({ id: row.id, status: row.status, byteCount: row.byteCount }),
    audit: async (values) => store.audits.push(values),
    readPage: async ({ name, organizationId, cursor }) => cursor ? [] : name === 'Organization' ? [{ ...org, id: organizationId }] : name === 'User' ? [user] : [],
  };
  const service = createTenantLifecycleService({ repository: repo, encrypt: (value) => ({ encrypted: Buffer.from(JSON.stringify(value)).toString('base64') }), decrypt: (value) => JSON.parse(Buffer.from(value.encrypted, 'base64').toString()), now: () => clock });
  return { repo, service, get store() { return store; }, advance: () => { clock += 3600001; } };
}
test('workspace export encrypted artifact, checksum, audited status/download and expiry execute correctly', async () => {
  const fixture = exportFixture(); const exported = await fixture.service.createExport(auth, orgId, {}); assert.equal(exported.status, 'ready');
  assert.ok(!fixture.store.exports[0].encryptedPayload.includes('organisationType'));
  const status = await fixture.service.exportStatus(auth, orgId, recordId); assert.equal(status.id, recordId);
  const download = await fixture.service.download(auth, orgId, recordId); assert.equal(JSON.parse(download.serialized).manifest.organizationId, orgId);
  assert.equal(fixture.store.exports[0].downloadCount, 1); assert.ok(fixture.store.audits.some((event) => event.action === 'workspace_export_download_authorized'));
  await assert.rejects(fixture.service.download(auth, orgId, otherId), errorCode('export_not_found'));
  fixture.advance(); await assert.rejects(fixture.service.download(auth, orgId, recordId), errorCode('export_unavailable'));
});
test('download audit failure rolls back download accounting and yields no file', async () => {
  const fixture = exportFixture(); await fixture.service.createExport(auth, orgId, {});
  fixture.repo.audit = async () => { throw new Error('download audit failed'); };
  await assert.rejects(fixture.service.download(auth, orgId, recordId), /download audit failed/); assert.equal(fixture.store.exports[0].downloadCount, 0);
});
test('export graph failure yields only failed status without partial payload', async () => {
  const fixture = exportFixture(); fixture.repo.readPage = async () => { throw new LifecycleError('export_resource_limit', 413); };
  await assert.rejects(fixture.service.createExport(auth, orgId, {}), errorCode('export_resource_limit'));
  assert.equal(fixture.store.exports[0].status, 'failed'); assert.equal(fixture.store.exports[0].encryptedPayload, null);
});

test('shared selector catalog permits only null-tenant and own-tenant definitions', () => {
  const shared = projectExportRow('SelectorOptionSet', { id: recordId, organizationId: null, label: 'Shared safe option' }, orgId);
  assert.equal(shared.label, 'Shared safe option');
  assert.throws(() => projectExportRow('SelectorOptionSet', { id: recordId, organizationId: otherId }, orgId), errorCode('export_tenant_boundary_violation'));
  assert.throws(() => projectExportRow('StrategicPlan', { id: recordId, organizationId: null }, orgId), errorCode('export_tenant_boundary_violation'));
});
