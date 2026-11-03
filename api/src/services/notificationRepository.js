import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { User, Organization, AuditLog } from '../models/index.js';
import { NotificationPreference, OrganizationNotificationPolicy, NotificationOutbox, ReliableNotificationDelivery, NotificationRecipientSuppression, NotificationFeedbackEvent } from '../models/notificationReliability.js';
import { currentNotificationContext, notificationSourceIsCurrent, sesConfigured } from './notificationReliabilityService.js';
import { getPulseRoutingSettings } from './pulseNotifications.js';
import { authorizeNotificationUser, DEFAULT_PREFERENCES, DEFAULT_ORG_POLICY, UUID_PATTERN, notificationError, genericNotification, deliveryTransition } from './notificationPolicy.js';

const plain = (record) => record?.get ? record.get({ plain: true }) : record;
async function lockScope(scope, auth, transaction) {
  const user = await User.findOne({ where: { id: scope.userId, organizationId: scope.organizationId }, transaction, lock: transaction.LOCK.UPDATE });
  const org = await Organization.findByPk(scope.organizationId, { transaction, lock: transaction.LOCK.UPDATE });
  authorizeNotificationUser(plain(user), plain(org), auth, true);
}
async function audit(scope, entityId, action, metadata, transaction) {
  return AuditLog.create({ organizationId: scope.organizationId, userId: scope.userId, entityType: 'notification', entityId, action, metadata }, { transaction });
}
export function decodeNotificationCursor(encoded) {
  if (!encoded) return null;
  if (typeof encoded !== 'string' || encoded.length > 180 || !/^[A-Za-z0-9_-]+$/.test(encoded)) throw notificationError('Invalid inbox cursor.');
  let value;
  try { value = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw notificationError('Invalid inbox cursor.'); }
  if (!value || Object.keys(value).length !== 2 || !UUID_PATTERN.test(String(value.id)) || typeof value.createdAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value.createdAt) || !Number.isFinite(Date.parse(value.createdAt))) throw notificationError('Invalid inbox cursor.');
  return value;
}
export function createNotificationRepository() {
  return {
    context: currentNotificationContext,
    providerConfigured: async () => sesConfigured(await getPulseRoutingSettings({ includeSecrets: true })),
    decodeCursor: decodeNotificationCursor,
    async updatePreferences({ scope, auth, value }) {
      return sequelize.transaction(async (transaction) => {
        await lockScope(scope, auth, transaction);
        const [row] = await NotificationPreference.findOrCreate({ where: { organizationId: scope.organizationId, userId: scope.userId }, defaults: DEFAULT_PREFERENCES, transaction });
        await row.update({ ...value, consentAt: value.emailEnabled ? (row.consentAt || new Date()) : null }, { transaction });
        if (!value.emailEnabled) await NotificationOutbox.update({ status: 'suppressed', errorCode: 'opted_out', leaseToken: null, leaseUntil: null }, { where: { organizationId: scope.organizationId, userId: scope.userId, channel: 'email', status: { [Op.in]: ['pending', 'leased'] } }, transaction });
        await audit(scope, row.id, 'notification_preferences_changed', value, transaction);
        return value;
      });
    },
    async updatePolicy({ scope, auth, value }) {
      return sequelize.transaction(async (transaction) => {
        await lockScope(scope, auth, transaction);
        if (scope.user.role !== 'org_admin') throw notificationError('Organisation administrator required.', 403);
        const [row] = await OrganizationNotificationPolicy.findOrCreate({ where: { organizationId: scope.organizationId }, defaults: DEFAULT_ORG_POLICY, transaction });
        await row.update(value, { transaction });
        const kinds = [...(!value.digestsEnabled ? ['collaboration_digest'] : []), ...(!value.remindersEnabled ? ['collaboration_reminder'] : [])];
        if (!value.emailEnabled || kinds.length) await NotificationOutbox.update({ status: 'suppressed', errorCode: 'policy_disabled', leaseToken: null, leaseUntil: null }, { where: { organizationId: scope.organizationId, channel: 'email', status: { [Op.in]: ['pending', 'leased'] }, ...(value.emailEnabled ? { kind: { [Op.in]: kinds } } : {}) }, transaction });
        await audit(scope, row.id, 'organisation_notification_policy_changed', value, transaction);
        return value;
      });
    },
    async listInbox({ scope, limit, cursor, unread }) {
      const now = new Date();
      const where = { organizationId: scope.organizationId, userId: scope.userId, channel: 'in_app', status: 'in_app', expiresAt: { [Op.gt]: now }, ...(unread ? { readAt: null } : {}) };
      if (cursor) where[Op.or] = [{ createdAt: { [Op.lt]: new Date(cursor.createdAt) } }, { createdAt: new Date(cursor.createdAt), id: { [Op.lt]: cursor.id } }];
      const rows = await NotificationOutbox.findAll({ where, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit });
      const items = [];
      // Hard capped fresh resource checks: no stale bodies/titles/URLs or cross-tenant details are exposed.
      for (const row of rows) if (await notificationSourceIsCurrent(row, now)) items.push({ id: row.id, kind: row.kind, ...genericNotification(row.kind), createdAt: row.createdAt, readAt: row.readAt });
      const last = rows[rows.length - 1];
      return { items, nextCursor: rows.length === limit ? Buffer.from(JSON.stringify({ id: last.id, createdAt: last.createdAt.toISOString() })).toString('base64url') : null };
    },
    async markRead({ scope, auth, id }) {
      return sequelize.transaction(async (transaction) => {
        await lockScope(scope, auth, transaction);
        const row = await NotificationOutbox.findOne({ where: { id, organizationId: scope.organizationId, userId: scope.userId, channel: 'in_app', status: 'in_app', expiresAt: { [Op.gt]: new Date() } }, transaction, lock: transaction.LOCK.UPDATE });
        if (!row || !await notificationSourceIsCurrent(row, new Date(), transaction)) return null;
        if (!row.readAt) { await row.update({ readAt: new Date() }, { transaction }); await audit(scope, row.id, 'notification_read', {}, transaction); }
        return { id: row.id, readAt: row.readAt };
      });
    },
    async listDelivery({ scope, limit }) {
      const rows = await ReliableNotificationDelivery.findAll({ where: { organizationId: scope.organizationId }, attributes: ['id', 'category', 'status', 'attempt', 'errorCode', 'createdAt', 'updatedAt'], order: [['createdAt', 'DESC']], limit });
      return rows.map(plain);
    },
  };
}
export async function applyVerifiedNotificationFeedback(event) {
  if (!event || !/^[a-f0-9]{64}$/.test(event.eventHash) || typeof event.providerReference !== 'string' || !event.providerReference || event.providerReference.length > 255 || !['delivered', 'bounced', 'complained', 'failed'].includes(event.outcome) || !Array.isArray(event.recipientHashes) || event.recipientHashes.length < 1 || event.recipientHashes.length > 50 || !event.recipientHashes.every((hash) => /^[a-f0-9]{64}$/.test(hash)) || !Number.isFinite(new Date(event.occurredAt).getTime())) throw notificationError('Invalid verified feedback metadata.');
  return sequelize.transaction(async (transaction) => {
    const [feedback, inserted] = await NotificationFeedbackEvent.findOrCreate({ where: { eventHash: event.eventHash }, defaults: { providerReference: event.providerReference, outcome: event.outcome, occurredAt: event.occurredAt }, transaction });
    if (!inserted) return { duplicate: true, updated: 0 };
    const deliveries = await ReliableNotificationDelivery.findAll({ where: { providerReference: event.providerReference, recipientHash: { [Op.in]: event.recipientHashes } }, transaction, lock: transaction.LOCK.UPDATE, limit: 50 });
    // Provider feedback may race the accepted receipt. Roll back the dedupe marker and
    // return a retryable 503 so trusted SNS redelivery can match it once durable.
    if (!deliveries.length) throw notificationError('Provider receipt is not available yet.', 503);
    let updated = 0;
    for (const row of deliveries) {
      const status = deliveryTransition(row.status, event.outcome);
      await row.update({ status }, { transaction });
      if (['bounced', 'complained'].includes(event.outcome)) {
        const [suppression] = await NotificationRecipientSuppression.findOrCreate({ where: { recipientHash: row.recipientHash }, defaults: { reason: event.outcome }, transaction });
        if (event.outcome === 'complained') await suppression.update({ reason: 'complained' }, { transaction });
      }
      if (row.outboxId) {
        const outbox = await NotificationOutbox.findByPk(row.outboxId, { transaction, lock: transaction.LOCK.UPDATE });
        if (outbox) await outbox.update({ status: deliveryTransition(outbox.status, event.outcome) }, { transaction });
      }
      if (row.organizationId) await AuditLog.create({ organizationId: row.organizationId, userId: null, entityType: 'notification_feedback', entityId: feedback.id, action: 'provider_feedback_applied', metadata: { outcome: event.outcome, deliveryId: row.id } }, { transaction });
      updated += 1;
    }
    return { duplicate: false, updated };
  });
}
