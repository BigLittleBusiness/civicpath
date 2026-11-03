import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// Parent runs this against its isolated MySQL8 DB after migrations. Never use production.
if (process.env.CIVICPATH_NOTIFICATION_TEST_ISOLATED !== '1' || process.env.NODE_ENV === 'production') throw new Error('Set CIVICPATH_NOTIFICATION_TEST_ISOLATED=1 only for an isolated non-production database.');
const { sequelize } = await import('../src/config/database.js');
const { Organization, User, CivicProject, CollaborationNotification, AuditLog } = await import('../src/models/index.js');
const { notificationModels, NotificationOutbox, ReliableNotificationDelivery, NotificationPreference, OrganizationNotificationPolicy, NotificationFeedbackEvent, NotificationRecipientSuppression } = await import('../src/models/notificationReliability.js');
const { enqueueCollaborationNotification, dispatchReliableNotifications, createNotificationStore } = await import('../src/services/notificationReliabilityService.js');
const { createNotificationRepository, applyVerifiedNotificationFeedback } = await import('../src/services/notificationRepository.js');
const { createNotificationController } = await import('../src/controllers/notificationController.js');
const { eventHash, recipientHash } = await import('../src/services/notificationPolicy.js');
const { migrateNotificationReliability } = await import('../db/migrations/017_notification_reliability.mjs');
const suffix = crypto.randomUUID(); const tenantIds = []; const feedbackHashes = []; const suppressedHashes = [];
const repository = createNotificationRepository(); let sends = 0;
const fakeConfig = { emailEnabled: true, awsCredentialsConfigured: true, fromEmail: 'test@example.invalid', awsRegion: 'ap-southeast-2' };
const store = createNotificationStore({ organizationIds: tenantIds, getConfiguration: async () => fakeConfig });
const sender = async ({ message }) => { sends += 1; assert.equal(JSON.stringify(message).includes('DO-NOT-STORE'), false); return { providerReference: `test-ses-${suffix}-${sends}` }; };
const now = () => new Date();
const authFor = (user) => ({ sub: user.id, organizationId: user.organizationId, role: user.role, sessionVersion: user.sessionVersion });
const scopeFor = async (user) => ({ ...(await repository.context(user.organizationId, user.id)), organizationId: user.organizationId, userId: user.id });
async function configure(user, emailEnabled = true) {
  await repository.updatePreferences({ scope: await scopeFor(user), auth: authFor(user), value: { emailEnabled, frequency: 'daily', quietStart: '00:00', quietEnd: '00:00', timezone: 'UTC' } });
}
async function sourceFor(user, project) {
  return sequelize.transaction(async (transaction) => {
    const notification = await CollaborationNotification.create({ organizationId: user.organizationId, userId: user.id, resourceType: 'project', resourceId: project.id, notificationType: 'mention', title: 'DO-NOT-STORE private content', detail: 'DO-NOT-STORE /reset?token=raw' }, { transaction });
    await enqueueCollaborationNotification({ notification, transaction }); return notification;
  });
}
async function worker() { return dispatchReliableNotifications({ store, sender, now, limit: 25 }); }
try {
  await sequelize.authenticate();
  await migrateNotificationReliability({ queryInterface: sequelize.getQueryInterface(), models: notificationModels });
  await migrateNotificationReliability({ queryInterface: sequelize.getQueryInterface(), models: notificationModels });
  const tenant = await Organization.create({ name: `Notification test ${suffix}`, slug: `notification-${suffix}`, country: 'AU', status: 'active' }); tenantIds.push(tenant.id);
  const otherTenant = await Organization.create({ name: `Notification other ${suffix}`, slug: `notification-other-${suffix}`, country: 'AU', status: 'active' }); tenantIds.push(otherTenant.id);
  const makeUser = (organizationId, role, name) => User.create({ organizationId, email: `${name}-${suffix}@example.invalid`, firstName: 'Test', lastName: name, passwordHash: 'test-only-not-a-login', role, status: 'active' });
  const admin = await makeUser(tenant.id, 'org_admin', 'admin'); const member = await makeUser(tenant.id, 'contributor', 'member'); const peer = await makeUser(tenant.id, 'contributor', 'peer'); const executive = await makeUser(tenant.id, 'executive', 'exec'); const other = await makeUser(otherTenant.id, 'contributor', 'other');
  const project = await CivicProject.create({ organizationId: tenant.id, ownerId: admin.id, name: 'Notification test project' });
  const otherProject = await CivicProject.create({ organizationId: otherTenant.id, ownerId: other.id, name: 'Other project' });
  assert.equal((await repository.context(tenant.id, member.id)).preferences.emailEnabled, false);
  const first = await sourceFor(member, project); await worker(); assert.equal(sends, 0, 'default-off must not send');
  await configure(member); await sourceFor(member, project); await worker(); assert.equal(sends, 0, 'tenant policy must also opt in');
  await repository.updatePolicy({ scope: await scopeFor(admin), auth: authFor(admin), value: { emailEnabled: true, digestsEnabled: true, remindersEnabled: true } });
  const permitted = await sourceFor(member, project);
  // Enqueue is idempotent and cannot persist copied private content or security URLs.
  await sequelize.transaction((transaction) => enqueueCollaborationNotification({ notification: permitted, transaction }));
  const queued = await NotificationOutbox.findAll({ where: { organizationId: tenant.id, userId: member.id, channel: 'email' } }); assert.equal(queued.length, 1);
  assert.equal(JSON.stringify(queued.map((row) => row.toJSON())).includes('DO-NOT-STORE'), false);
  await Promise.all([worker(), worker()]); assert.equal(sends, 1, 'concurrent claims must not duplicate send'); await worker(); assert.equal(sends, 1);
  assert.equal((await ReliableNotificationDelivery.findOne({ where: { organizationId: tenant.id, userId: member.id } })).status, 'accepted');
  const crashRow = await NotificationOutbox.create({ organizationId: tenant.id, userId: member.id, channel: 'email', kind: 'collaboration_digest', sourceType: 'collaboration_notification', sourceId: permitted.id, eventKey: eventHash(`crash-${suffix}`), frequency: 'daily', timezone: 'UTC', status: 'sending', attemptCount: 1, availableAt: new Date(), expiresAt: new Date(Date.now() + 86400000), leaseToken: crypto.randomUUID(), leaseUntil: new Date(Date.now() - 1000) });
  const oldLease = crashRow.toJSON();
  await ReliableNotificationDelivery.create({ organizationId: tenant.id, userId: member.id, outboxId: crashRow.id, attempt: 1, category: 'collaboration_digest', recipientHash: recipientHash(member.email), status: 'sending' });
  await worker(); assert.equal((await crashRow.reload()).status, 'uncertain'); assert.equal(sends, 1, 'crash-after-send is never replayed');
  assert.equal(await store.finish(oldLease, { status: 'accepted', providerReference: 'stale-worker' }), false, 'stale lease cannot overwrite recovery');
  const inbox = await repository.listInbox({ scope: await scopeFor(member), limit: 20, cursor: null, unread: false }); assert.ok(inbox.items.length > 0);
  const wrong = await repository.markRead({ scope: await scopeFor(peer), auth: authFor(peer), id: inbox.items[0].id }); assert.equal(wrong, null, 'same-tenant peer cannot mark another inbox read');
  assert.equal(await repository.markRead({ scope: await scopeFor(other), auth: authFor(other), id: inbox.items[0].id }), null, 'other tenant cannot mark inbox read');
  const read = await repository.markRead({ scope: await scopeFor(member), auth: authFor(member), id: inbox.items[0].id }); assert.ok(read.readAt);
  const controller = createNotificationController({ repository }); const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await controller.updatePreferences({ auth: authFor(executive), body: { emailEnabled: true } }, response, (error) => { throw error; }); assert.equal(response.code, 403);
  await configure(peer); await sourceFor(peer, project); await configure(peer, false); await worker(); assert.equal(sends, 1, 'optout cancels queued email');
  await configure(peer); await sourceFor(peer, project); await peer.update({ status: 'disabled' }); await worker(); assert.equal(sends, 1, 'disabled user cannot receive');
  await peer.update({ status: 'active' });
  const suspended = await makeUser(tenant.id, 'contributor', 'suspended'); await configure(suspended); await sourceFor(suspended, project);
  await tenant.update({ status: 'suspended' }); await worker(); assert.equal(sends, 1, 'suspended tenant cannot send'); await tenant.update({ status: 'active' });
  const stale = await makeUser(tenant.id, 'contributor', 'stale'); await configure(stale); await sourceFor(stale, project); await project.update({ stage: 'completed' });
  // Deleted sources/resources suppress; stage filtering is also tested via soft delete.
  await project.destroy(); await worker(); assert.equal(sends, 1, 'deleted resource must suppress stale email'); await project.restore();
  await project.update({ stage: 'concept' });
  // Required audit failure rolls back source + outbox atomically.
  const beforeSources = await CollaborationNotification.count({ where: { organizationId: tenant.id } }); const beforeOutbox = await NotificationOutbox.count({ where: { organizationId: tenant.id } });
  AuditLog.addHook('beforeCreate', 'notification-test-fail', () => { throw new Error('forced notification audit failure'); });
  try { await assert.rejects(() => sourceFor(member, project)); } finally { AuditLog.removeHook('beforeCreate', 'notification-test-fail'); }
  assert.equal(await CollaborationNotification.count({ where: { organizationId: tenant.id } }), beforeSources); assert.equal(await NotificationOutbox.count({ where: { organizationId: tenant.id } }), beforeOutbox);
  const receipt = await ReliableNotificationDelivery.findOne({ where: { organizationId: tenant.id, userId: member.id, status: 'accepted' } });
  const feedback = { eventHash: eventHash(`feedback-${suffix}`), providerReference: receipt.providerReference, outcome: 'bounced', recipientHashes: [recipientHash(member.email)], occurredAt: new Date() }; feedbackHashes.push(feedback.eventHash); suppressedHashes.push(recipientHash(member.email));
  assert.equal((await applyVerifiedNotificationFeedback(feedback)).updated, 1); assert.equal((await applyVerifiedNotificationFeedback(feedback)).duplicate, true);
  assert.equal((await receipt.reload()).status, 'bounced');
  await configure(other); await OrganizationNotificationPolicy.create({ organizationId: otherTenant.id, emailEnabled: true, digestsEnabled: true, remindersEnabled: true });
  const suppressed = await makeUser(otherTenant.id, 'contributor', 'suppressed'); await configure(suppressed); const suppressedHash = recipientHash(suppressed.email); suppressedHashes.push(suppressedHash); await NotificationRecipientSuppression.create({ recipientHash: suppressedHash, reason: 'complained' }); await sourceFor(suppressed, otherProject); await worker(); assert.equal(sends, 1, 'complaint suppression applies at send time');
  console.info('Notification isolated flow passed: migration rerun, opt-in+policy, concurrency, inbox ownership, read-only executive, disabled/suspended/optout/stale suppression, audit rollback and feedback idempotency. Fake provider only.');
} finally {
  // Remove only records belonging to this test's random tenants; do not touch existing developer fixtures.
  if (tenantIds.length) {
    await ReliableNotificationDelivery.destroy({ where: { organizationId: tenantIds } }); await NotificationOutbox.destroy({ where: { organizationId: tenantIds } });
    await NotificationPreference.destroy({ where: { organizationId: tenantIds } }); await OrganizationNotificationPolicy.destroy({ where: { organizationId: tenantIds } });
    await AuditLog.destroy({ where: { organizationId: tenantIds }, force: true }); await CollaborationNotification.destroy({ where: { organizationId: tenantIds }, force: true });
    await CivicProject.destroy({ where: { organizationId: tenantIds }, force: true }); await User.destroy({ where: { organizationId: tenantIds }, force: true }); await Organization.destroy({ where: { id: tenantIds }, force: true });
  }
  if (feedbackHashes.length) await NotificationFeedbackEvent.destroy({ where: { eventHash: feedbackHashes } });
  if (suppressedHashes.length) await NotificationRecipientSuppression.destroy({ where: { recipientHash: suppressedHashes } });
  await sequelize.close();
}
