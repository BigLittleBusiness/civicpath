import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import { DEFAULT_PREFERENCES, DEFAULT_ORG_POLICY, validatePreferences, validateOrgPolicy, authorizeNotificationUser, emailGate, quietAt, scheduleEmail, retryDecision, deliveryTransition, genericNotification } from '../src/services/notificationPolicy.js';
import { processNotificationBatch } from '../src/services/notificationWorker.js';
import { createPinnedSnsVerifier, snsSigningString } from '../src/services/notificationFeedback.js';
import { sendSingleUseTransactionalEmail } from '../src/services/notificationTransactional.js';
import { createNotificationController } from '../src/controllers/notificationController.js';
import { migrateNotificationReliability } from '../db/migrations/017_notification_reliability.mjs';
const instant = new Date('2026-11-03T12:00:00Z');
const user = { id: 'user', organizationId: 'org', role: 'contributor', status: 'active', sessionVersion: 1 };
const organization = { id: 'org', status: 'active' };
const auth = { sub: 'user', organizationId: 'org', role: 'contributor', sessionVersion: 1 };

test('defaults are email-off and validation allowlists reject injected sensitive fields', () => {
  assert.equal(DEFAULT_PREFERENCES.emailEnabled, false); assert.equal(DEFAULT_ORG_POLICY.emailEnabled, false);
  assert.throws(() => validatePreferences({ token: 'raw' })); assert.throws(() => validatePreferences({ emailEnabled: 'true' }));
  assert.throws(() => validatePreferences({ frequency: 'immediate' })); assert.throws(() => validatePreferences({ timezone: 'Bogus/Zone' }));
  assert.throws(() => validatePreferences({ quietStart: '24:10' })); assert.throws(() => validateOrgPolicy({ userId: 'another' }));
  assert.equal(validatePreferences({ emailEnabled: true }).emailEnabled, true);
});
test('authorization requires fresh role, active tenant, matching user and session; executive is read-only', () => {
  assert.equal(authorizeNotificationUser(user, organization, auth, true).userId, 'user');
  assert.throws(() => authorizeNotificationUser(user, organization, {}, false), { status: 401 });
  assert.throws(() => authorizeNotificationUser({ ...user, organizationId: 'other' }, organization, auth), { status: 401 });
  assert.throws(() => authorizeNotificationUser({ ...user, status: 'disabled' }, organization, auth), { status: 401 });
  assert.throws(() => authorizeNotificationUser(user, { ...organization, status: 'suspended' }, auth), { status: 403 });
  assert.throws(() => authorizeNotificationUser(user, organization, { ...auth, role: 'org_admin' }), { status: 401 });
  const executive = { ...user, role: 'executive' }; const executiveAuth = { ...auth, role: 'executive' };
  assert.equal(authorizeNotificationUser(executive, organization, executiveAuth).userId, 'user');
  assert.throws(() => authorizeNotificationUser(executive, organization, executiveAuth, true), { status: 403 });
  assert.throws(() => authorizeNotificationUser(user, organization, { ...auth, sessionVersion: 2 }), { status: 401 });
});
test('optional email requires user opt-in, organisation policy, SES and no suppression', () => {
  const args = { user, organization, preferences: { ...DEFAULT_PREFERENCES, emailEnabled: true }, policy: { ...DEFAULT_ORG_POLICY, emailEnabled: true }, configured: true, suppressed: false, kind: 'collaboration_digest' };
  assert.equal(emailGate(args), null);
  assert.equal(emailGate({ ...args, preferences: DEFAULT_PREFERENCES }), 'opted_out');
  assert.equal(emailGate({ ...args, policy: DEFAULT_ORG_POLICY }), 'policy_disabled');
  assert.equal(emailGate({ ...args, configured: false }), 'provider_disabled');
  assert.equal(emailGate({ ...args, suppressed: true }), 'recipient_suppressed');
  assert.equal(emailGate({ ...args, user: { ...user, status: 'disabled' } }), 'inactive');
  assert.equal(emailGate({ ...args, organization: { ...organization, status: 'suspended' } }), 'inactive');
});
test('quiet hours defer email across midnight and DST using timezone-aware instants', () => {
  assert.equal(quietAt(new Date('2026-11-03T22:00:00Z'), DEFAULT_PREFERENCES), true);
  assert.equal(quietAt(instant, DEFAULT_PREFERENCES), false);
  const schedule = scheduleEmail(new Date('2026-11-03T22:00:00Z'), DEFAULT_PREFERENCES);
  assert.equal(schedule.availableAt.toISOString(), '2026-11-04T08:00:00.000Z');
  assert.equal(schedule.bucket, 'daily:UTC:2026-11-03');
  assert.equal(scheduleEmail(instant, { ...DEFAULT_PREFERENCES, frequency: 'weekly' }).bucket, 'weekly:UTC:2026-11-02');
  const dst = scheduleEmail(new Date('2026-10-03T15:30:00Z'), { ...DEFAULT_PREFERENCES, timezone: 'Australia/Sydney', quietStart: '01:00', quietEnd: '03:00' });
  assert.equal(dst.availableAt.toISOString(), '2026-10-03T16:00:00.000Z');
});
test('only explicit safe throttling retries; timeouts are uncertain and attempts bounded', () => {
  assert.equal(retryDecision({ name: 'Throttling' }, 1, instant, () => 0).availableAt.getTime(), instant.getTime() + 60000);
  assert.equal(retryDecision({ name: 'Throttling' }, 5, instant).status, 'failed');
  assert.equal(retryDecision({ name: 'TimeoutError', message: 'private@recipient.invalid' }, 1, instant).status, 'uncertain');
  assert.equal(retryDecision({ name: 'MessageRejected' }, 1, instant).status, 'failed');
  assert.equal(deliveryTransition('accepted', 'delivered'), 'delivered');
  assert.equal(deliveryTransition('bounced', 'delivered'), 'bounced');
  assert.equal(deliveryTransition('delivered', 'complained'), 'complained');
});
function fakeStore({ suppression = null, begin = true, failure = false, finishFailure = false } = {}) {
  let claim = true; const patches = []; let starts = 0;
  const row = { id: 'row', organizationId: 'org', userId: 'user', leaseToken: 'lease', channel: 'email', kind: 'collaboration_digest', expiresAt: new Date(instant.getTime() + 86400000), attemptCount: 0 };
  return { patches, get starts() { return starts; }, async claim() { if (!claim) return []; claim = false; return [row]; }, async context() { if (failure) throw Error('private context'); return { suppression, email: 'sample@example.invalid', config: {} }; }, async beginSend() { starts += 1; row.attemptCount += 1; return begin; }, async finish(_row, patch) { if (finishFailure) throw Error('db unavailable'); patches.push(patch); return true; } };
}
test('worker reports accepted, not delivered; duplicate processing cannot send twice', async () => {
  const store = fakeStore(); let sends = 0;
  const sender = async ({ message }) => { sends += 1; assert.equal(message.text.includes('token='), false); return { providerReference: 'ses-id' }; };
  const first = await processNotificationBatch({ store, sender, now: () => instant });
  assert.equal(first.accepted, 1); assert.equal(store.patches[0].status, 'accepted');
  await processNotificationBatch({ store, sender, now: () => instant }); assert.equal(sends, 1);
});
test('worker suppresses opted-out/disabled/stale users and cannot send with lost lease', async () => {
  for (const suppression of ['opted_out', 'inactive', 'stale_source', 'recipient_suppressed']) {
    const store = fakeStore({ suppression });
    await processNotificationBatch({ store, sender: async () => assert.fail('must not send'), now: () => instant });
    assert.equal(store.patches[0].status, 'suppressed');
  }
  const store = fakeStore({ begin: false }); const result = await processNotificationBatch({ store, sender: async () => assert.fail('must not send'), now: () => instant }); assert.equal(result.lostLease, 1);
});
test('worker retries throttling but never ambiguous outcomes; handles dependency failure safely', async () => {
  for (const [name, expected] of [['Throttling', 'pending'], ['TimeoutError', 'uncertain'], ['MessageRejected', 'failed']]) {
    const store = fakeStore(); await processNotificationBatch({ store, sender: async () => { const error = Error('secret'); error.name = name; throw error; }, now: () => instant, random: () => 0 });
    assert.equal(store.patches[0].status, expected); assert.equal(JSON.stringify(store.patches).includes('secret'), false);
  }
  const store = fakeStore({ failure: true }); await processNotificationBatch({ store, sender: async () => assert.fail(), now: () => instant }); assert.equal(store.patches[0].errorCode, 'context_unavailable');
  await assert.rejects(() => processNotificationBatch({ store, sender: async () => {}, limit: 26 }));
});
test('transactional security messages persist only metadata and fail closed if receipts unavailable', async () => {
  const recorded = []; let sends = 0;
  const args = { to: 'sample@example.invalid', message: { subject: 'Reset', text: 'https://example.invalid/reset?token=DO-NOT-STORE', html: 'DO-NOT-STORE' }, category: 'password_reset' };
  const deps = { guard: async () => null, configuration: async () => ({ emailEnabled: true, awsCredentialsConfigured: true, fromEmail: 'source@example.invalid' }), receipts: { start: async (data) => { recorded.push(data); return {}; }, finish: async (_row, data) => recorded.push(data) }, send: async () => { sends += 1; return { providerReference: 'ses' }; } };
  assert.equal((await sendSingleUseTransactionalEmail(args, deps)).status, 'accepted'); assert.equal(JSON.stringify(recorded).includes('DO-NOT-STORE'), false);
  const fail = { ...deps, receipts: { start: async () => { throw Error('db fail'); } } };
  assert.equal((await sendSingleUseTransactionalEmail(args, fail)).errorCode, 'receipt_unavailable'); assert.equal(sends, 1);
  assert.equal((await sendSingleUseTransactionalEmail(args, { ...deps, guard: async () => 'inactive' })).status, 'disabled'); assert.equal(sends, 1);
});
const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const topic = 'arn:aws:sns:ap-southeast-2:123456789012:CivicPathFeedback';
const certificateUrl = 'https://sns.ap-southeast-2.amazonaws.com/SimpleNotificationService-example.pem';
function signedEnvelope(overrides = {}) {
  const value = { Type: 'Notification', MessageId: 'signed-event-id', Timestamp: instant.toISOString(), TopicArn: topic, SignatureVersion: '2', SigningCertURL: certificateUrl, Message: JSON.stringify({ notificationType: 'Bounce', mail: { messageId: 'ses-id' }, bounce: { bouncedRecipients: [{ emailAddress: 'sample@example.invalid' }], diagnosticCode: 'PRIVATE' } }), ...overrides };
  value.Signature = crypto.sign('RSA-SHA256', Buffer.from(snsSigningString(value)), keys.privateKey).toString('base64'); return Buffer.from(JSON.stringify(value));
}
const verifier = createPinnedSnsVerifier({ now: () => instant, pins: { [topic]: { signingCertUrl: certificateUrl, publicKeyPem: keys.publicKey.export({ type: 'spki', format: 'pem' }), validFrom: '2026-11-01T00:00:00Z', validUntil: '2026-12-01T00:00:00Z' } } });
test('signed provider feedback validates exact trusted topic, pinned RSA key, URL and timestamp', () => {
  const event = verifier.verify(signedEnvelope()); assert.equal(event.outcome, 'bounced'); assert.equal(event.recipientHashes.length, 1);
  assert.equal(JSON.stringify(event).includes('sample@'), false); assert.equal(JSON.stringify(event).includes('PRIVATE'), false);
  const tampered = JSON.parse(signedEnvelope()); tampered.Message = '{}'; assert.throws(() => verifier.verify(Buffer.from(JSON.stringify(tampered))));
  assert.throws(() => verifier.verify(signedEnvelope({ TopicArn: 'arn:aws:sns:ap-southeast-2:123456789012:Other' })));
  assert.throws(() => verifier.verify(signedEnvelope({ SigningCertURL: 'https://attacker.invalid/key.pem' })));
  assert.throws(() => verifier.verify(signedEnvelope({ Type: 'SubscriptionConfirmation' })));
  assert.throws(() => verifier.verify(signedEnvelope({ Timestamp: '2026-10-01T00:00:00Z' })));
  assert.throws(() => createPinnedSnsVerifier().verify(signedEnvelope()), { status: 503 });
});
test('controller wrong-role preferences and wrong-role org policy never reach writes', async () => {
  let writes = 0; const context = { user: { ...user, role: 'executive' }, organization, preferences: DEFAULT_PREFERENCES, policy: DEFAULT_ORG_POLICY };
  const controller = createNotificationController({ repository: { context: async () => context, updatePreferences: async () => { writes += 1; } } });
  const response = { status(code) { this.code = code; return this; }, json(data) { this.data = data; } };
  await controller.updatePreferences({ auth: { ...auth, role: 'executive' }, body: { emailEnabled: true } }, response, (error) => { throw error; });
  assert.equal(response.code, 403); assert.equal(writes, 0);
});
test('additive migration rerun makes no duplicate DDL and resumes missing columns/indexes', async () => {
  const state = {}; let operations = 0;
  const model = { getTableName: () => 'NotificationUnit', getAttributes: () => ({ id: { field: 'id', type: 'UUID' }, organizationId: { field: 'organization_id', type: 'UUID' } }), options: { indexes: [{ name: 'unique_test', fields: ['organization_id'], unique: true }] } };
  const queryInterface = { showAllTables: async () => Object.keys(state), createTable: async (table, columns) => { operations += 1; state[table] = { columns, indexes: [] }; }, describeTable: async (table) => state[table].columns, addColumn: async (table, key, definition) => { operations += 1; state[table].columns[key] = definition; }, showIndex: async (table) => state[table].indexes, addIndex: async (table, _fields, index) => { operations += 1; state[table].indexes.push(index); } };
  await migrateNotificationReliability({ queryInterface, models: [model] }); const before = operations;
  await migrateNotificationReliability({ queryInterface, models: [model] }); assert.equal(operations, before);
  delete state.NotificationUnit.columns.organization_id; await migrateNotificationReliability({ queryInterface, models: [model] }); assert.equal(operations, before + 1);
});
