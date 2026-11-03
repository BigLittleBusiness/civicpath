import { RecordMaintenanceState } from '../models/recordMaintenance.js';
import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { sequelize } from '../config/database.js';
import { Organization, User, Subscription, AuditLog, CollaborationNotification, CollaborationRequest, StrategyAction, StrategicPlan, CivicProject, StrategyDecision, ActionDependency, FundingCollaborationRoom, ReviewPack, QuarterlyActionUpdate } from '../models/index.js';
import { NotificationPreference, OrganizationNotificationPolicy, NotificationOutbox, ReliableNotificationDelivery, NotificationRecipientSuppression } from '../models/notificationReliability.js';
import { getPulseRoutingSettings } from './pulseNotifications.js';
import { brandedEmail, escapeEmailHtml } from './emailBranding.js';
import { DEFAULT_PREFERENCES, DEFAULT_ORG_POLICY, MAX_ATTEMPTS, MAX_BATCH, LEASE_MS, UUID_PATTERN, eventHash, recipientHash, emailGate, quietAt, scheduleEmail, notificationError } from './notificationPolicy.js';
import { processNotificationBatch } from './notificationWorker.js';

const resourceModels = { action: StrategyAction, project: CivicProject, decision: StrategyDecision, dependency: ActionDependency, funding_room: FundingCollaborationRoom, review_pack: ReviewPack, quarterly_update: QuarterlyActionUpdate };
const resourceMaintenanceKinds = { action: 'actions', project: 'projects', decision: 'decisions', risk: 'risks', funding_position: 'funding' };
const plain = (record) => record?.get ? record.get({ plain: true }) : record;
export const sesConfigured = (config) => Boolean(config?.emailEnabled && config.awsCredentialsConfigured && config.fromEmail && config.awsRegion);
export async function currentNotificationContext(organizationId, userId, transaction) {
  const [user, organization, preference, policy, subscription] = await Promise.all([
    User.findOne({ where: { id: userId, organizationId }, transaction }), Organization.findByPk(organizationId, { transaction }),
    NotificationPreference.findOne({ where: { organizationId, userId }, transaction }), OrganizationNotificationPolicy.findOne({ where: { organizationId }, transaction }),
    Subscription.findOne({ where: { organizationId, status: 'active', [Op.or]: [{ endsAt: null }, { endsAt: { [Op.gt]: new Date() } }] }, attributes: ['id'], transaction }),
  ]);
  return { entitled: Boolean(subscription), user: plain(user), organization: plain(organization), preferences: preference ? { emailEnabled: preference.emailEnabled, frequency: preference.frequency, quietStart: preference.quietStart, quietEnd: preference.quietEnd, timezone: preference.timezone } : { ...DEFAULT_PREFERENCES }, policy: policy ? { emailEnabled: policy.emailEnabled, digestsEnabled: policy.digestsEnabled, remindersEnabled: policy.remindersEnabled } : { ...DEFAULT_ORG_POLICY } };
}
export async function notificationSourceIsCurrent(row, now = new Date(), transaction) {
  let source;
  if (row.sourceType === 'collaboration_notification') {
    source = await CollaborationNotification.findOne({ where: { id: row.sourceId, organizationId: row.organizationId, userId: row.userId, readAt: null, createdAt: { [Op.gte]: new Date(now.getTime() - 7 * 86400000), [Op.lte]: now } }, transaction });
  } else if (row.sourceType === 'collaboration_request') {
    source = await CollaborationRequest.findOne({ where: { id: row.sourceId, organizationId: row.organizationId, requestedFromUserId: row.userId, status: { [Op.in]: ['open', 'changes_requested'] }, dueDate: { [Op.lte]: new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10), [Op.gte]: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10) } }, transaction });
  } else return false;
  const Model = source && resourceModels[source.resourceType];
  if (!Model) return false;
  const resource = await Model.findOne({ where: { id: source.resourceId, organizationId: row.organizationId }, transaction });
  if (!resource || resource.isActive === false || ['archived', 'closed', 'complete', 'completed', 'not_proceeding', 'resolved'].includes(resource.status) || resource.stage === 'completed' || resource.handoverStatus === 'declined') return false;
  const kind = resourceMaintenanceKinds[source.resourceType];
  if (kind && await RecordMaintenanceState.findOne({ where: { organizationId: row.organizationId, kind, recordId: resource.id, archivedAt: { [Op.ne]: null } }, attributes: ['id'], transaction })) return false;
  if (resource.projectId) {
    const project = await CivicProject.findOne({ where: { id: resource.projectId, organizationId: row.organizationId }, attributes: ['id'], transaction });
    if (!project || await RecordMaintenanceState.findOne({ where: { organizationId: row.organizationId, kind: 'projects', recordId: resource.projectId, archivedAt: { [Op.ne]: null } }, attributes: ['id'], transaction })) return false;
  }
  if (resource.actionId) {
    const action = await StrategyAction.findOne({ where: { id: resource.actionId, organizationId: row.organizationId, isActive: true }, attributes: ['id'], transaction });
    if (!action || await RecordMaintenanceState.findOne({ where: { organizationId: row.organizationId, kind: 'actions', recordId: resource.actionId, archivedAt: { [Op.ne]: null } }, attributes: ['id'], transaction })) return false;
  }
  if (resource.strategyId && !await StrategicPlan.findOne({ where: { id: resource.strategyId, organizationId: row.organizationId, status: 'active' }, transaction })) return false;
  return true;
}
async function systemAudit({ organizationId, userId = null, entityId, action, metadata = {}, transaction }) {
  return AuditLog.create({ organizationId, userId, entityType: 'notification_outbox', entityId, action, metadata }, { transaction });
}
async function enqueueSource({ source, sourceType, kind, transaction, now }) {
  if (!transaction) throw notificationError('Notification enqueue requires the business transaction.');
  const organizationId = source.organizationId; const userId = sourceType === 'collaboration_request' ? source.requestedFromUserId : source.userId;
  if (![organizationId, userId, source.id].every((id) => UUID_PATTERN.test(String(id)))) throw notificationError('Invalid notification tenant references.');
  const context = await currentNotificationContext(organizationId, userId, transaction);
  if (emailGate({ ...context, configured: true, kind }) === 'inactive') return { created: 0 };
  const reference = { organizationId, userId, sourceType, sourceId: source.id, kind };
  if (!await notificationSourceIsCurrent(reference, now, transaction)) return { created: 0 };
  const schedules = [{ channel: 'in_app', eventKey: eventHash(`${sourceType}:${source.id}:${kind}:${kind === 'collaboration_reminder' ? now.toISOString().slice(0, 10) : 'event'}`), availableAt: now }];
  if (context.entitled && !emailGate({ ...context, configured: true, kind })) {
    const schedule = scheduleEmail(now, context.preferences);
    schedules.push({ channel: 'email', eventKey: eventHash(`${kind}:${schedule.bucket}`), availableAt: schedule.availableAt, frequency: context.preferences.frequency, timezone: context.preferences.timezone });
  }
  let created = 0;
  for (const schedule of schedules) {
    const [row, inserted] = await NotificationOutbox.findOrCreate({ where: { organizationId, userId, channel: schedule.channel, eventKey: schedule.eventKey }, defaults: { ...reference, availableAt: schedule.availableAt, frequency: schedule.frequency || null, timezone: schedule.timezone || null, expiresAt: new Date(now.getTime() + 7 * 86400000) }, transaction });
    if (inserted) { await systemAudit({ organizationId, entityId: row.id, action: 'notification_queued', metadata: { kind, channel: schedule.channel }, transaction }); created += 1; }
  }
  return { created };
}
// Pass the persisted notification created inside the caller's business transaction. No title/detail/body is copied.
export async function enqueueCollaborationNotification({ notification, transaction, now = new Date() }) {
  if (!notification?.id) throw notificationError('A persisted collaboration notification is required.');
  const source = await CollaborationNotification.findOne({ where: { id: notification.id, organizationId: notification.organizationId, userId: notification.userId }, transaction });
  if (!source) throw notificationError('Notification source is unavailable.');
  return enqueueSource({ source, sourceType: 'collaboration_notification', kind: 'collaboration_digest', transaction, now });
}
// Parent provides approved tenant IDs and paginates; no global unbounded tenant scan or daemon.
export async function enqueueCollaborationReminders({ organizationId, limit = MAX_BATCH, afterId = null, now = new Date() }) {
  if (!UUID_PATTERN.test(String(organizationId)) || (afterId && !UUID_PATTERN.test(String(afterId))) || !Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) throw notificationError('Invalid reminder scope or limit.');
  const where = { organizationId, status: { [Op.in]: ['open', 'changes_requested'] }, dueDate: { [Op.lte]: new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10), [Op.gte]: new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10) } };
  if (afterId) where.id = { [Op.gt]: afterId };
  const sources = await CollaborationRequest.findAll({ where, order: [['id', 'ASC']], limit });
  let created = 0;
  for (const source of sources) created += (await sequelize.transaction((transaction) => enqueueSource({ source, sourceType: 'collaboration_request', kind: 'collaboration_reminder', transaction, now }))).created;
  return { scanned: sources.length, created, nextCursor: sources.length === limit ? sources[sources.length - 1].id : null };
}
export async function sendGenericSesNotification({ to, config, message, outboxId }) {
  if (!sesConfigured(config)) throw notificationError('SES is not configured.');
  const client = new SESClient({ region: config.awsRegion, credentials: { accessKeyId: config.awsAccessKeyId, secretAccessKey: config.awsSecretAccessKey }, maxAttempts: 1 });
  try {
    const response = await client.send(new SendEmailCommand({
      Source: config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail,
      // No Reply-To mailbox is exposed: assistance is through the internal contact form only.
      Destination: { ToAddresses: [to] }, Tags: [{ Name: 'civicpath-outbox', Value: outboxId }],
      Message: { Subject: { Charset: 'UTF-8', Data: `CivicPath - ${message.title}` }, Body: { Text: { Charset: 'UTF-8', Data: message.text }, Html: { Charset: 'UTF-8', Data: brandedEmail({ heading: message.title, preheader: 'Review current information securely in CivicPath.', contentHtml: `<p>${escapeEmailHtml(message.text)}</p>` }) } } },
    }), { abortSignal: AbortSignal.timeout(15000) });
    return { providerReference: response.MessageId };
  } finally { client.destroy(); }
}
export function createNotificationStore({ organizationIds = [], getConfiguration = () => getPulseRoutingSettings({ includeSecrets: true }) } = {}) {
  const fencedWhere = (row) => ({ id: row.id, organizationId: row.organizationId, userId: row.userId, leaseToken: row.leaseToken, status: { [Op.in]: ['leased', 'sending'] } });
  return {
    async claim({ limit, now }) {
      if (!Array.isArray(organizationIds) || organizationIds.length > 100 || !organizationIds.every((id) => UUID_PATTERN.test(String(id)))) throw notificationError('Worker requires at most 100 approved tenant IDs.');
      if (!organizationIds.length) return [];
      return sequelize.transaction(async (transaction) => {
        // Recover only a bounded batch. Sending is never automatically replayed after crash/timeout.
        const abandoned = await NotificationOutbox.findAll({ where: { organizationId: { [Op.in]: organizationIds }, status: 'sending', leaseUntil: { [Op.lte]: now } }, order: [['leaseUntil', 'ASC']], limit, transaction, lock: transaction.LOCK.UPDATE });
        for (const row of abandoned) {
          await row.update({ status: 'uncertain', leaseToken: null, leaseUntil: null, errorCode: 'acceptance_unknown' }, { transaction });
          await ReliableNotificationDelivery.update({ status: 'uncertain', errorCode: 'acceptance_unknown' }, { where: { outboxId: row.id, attempt: row.attemptCount, status: 'sending' }, transaction });
        }
        const rows = await NotificationOutbox.findAll({ where: { organizationId: { [Op.in]: organizationIds }, [Op.or]: [{ status: 'pending', availableAt: { [Op.lte]: now } }, { status: 'leased', leaseUntil: { [Op.lte]: now } }] }, order: [['availableAt', 'ASC'], ['id', 'ASC']], limit, transaction, lock: transaction.LOCK.UPDATE });
        const claimed = [];
        for (const row of rows) {
          if (row.attemptCount >= MAX_ATTEMPTS) { await row.update({ status: 'failed', errorCode: 'retry_limit', leaseToken: null, leaseUntil: null }, { transaction }); continue; }
          await row.update({ status: 'leased', leaseToken: crypto.randomUUID(), leaseUntil: new Date(now.getTime() + LEASE_MS) }, { transaction }); claimed.push(plain(row));
        }
        return claimed;
      });
    },
    async context(row, now) {
      const context = await currentNotificationContext(row.organizationId, row.userId);
      if (emailGate({ ...context, configured: true, kind: row.kind }) === 'inactive') return { suppression: 'inactive' };
      if (!await notificationSourceIsCurrent(row, now)) return { suppression: 'stale_source' };
      if (!context.entitled) return { suppression: 'entitlement_inactive' };
      if (row.channel === 'in_app') return {};
      if (row.frequency !== context.preferences.frequency || row.timezone !== context.preferences.timezone) return { suppression: 'schedule_changed' };
      const config = await getConfiguration();
      const suppressed = context.user?.email ? await NotificationRecipientSuppression.findOne({ where: { recipientHash: recipientHash(context.user.email) }, attributes: ['id'] }) : true;
      const suppression = emailGate({ ...context, configured: sesConfigured(config), suppressed, kind: row.kind });
      if (suppression) return { suppression };
      if (quietAt(now, context.preferences)) return { deferUntil: scheduleEmail(now, context.preferences).availableAt };
      return { email: context.user.email, config };
    },
    async beginSend(row, context, now) {
      return sequelize.transaction(async (transaction) => {
        const [changed] = await NotificationOutbox.update({ status: 'sending', attemptCount: row.attemptCount + 1 }, { where: { ...fencedWhere(row), status: 'leased', leaseUntil: { [Op.gt]: now } }, transaction });
        if (!changed) return false;
        row.attemptCount += 1;
        await ReliableNotificationDelivery.create({ organizationId: row.organizationId, userId: row.userId, outboxId: row.id, attempt: row.attemptCount, category: row.kind, recipientHash: recipientHash(context.email), status: 'sending' }, { transaction });
        await systemAudit({ organizationId: row.organizationId, entityId: row.id, action: 'notification_send_started', metadata: { attempt: row.attemptCount }, transaction });
        return true;
      });
    },
    async finish(row, patch) {
      return sequelize.transaction(async (transaction) => {
        const [changed] = await NotificationOutbox.update({ ...patch, leaseToken: null, leaseUntil: null }, { where: fencedWhere(row), transaction });
        if (!changed) return false;
        if (row.channel === 'email' && row.attemptCount > 0) await ReliableNotificationDelivery.update({ status: patch.status === 'pending' ? 'retrying' : patch.status, providerReference: patch.providerReference || null, errorCode: patch.errorCode || null }, { where: { outboxId: row.id, attempt: row.attemptCount, status: 'sending' }, transaction });
        await systemAudit({ organizationId: row.organizationId, entityId: row.id, action: 'notification_outcome', metadata: { status: patch.status, errorCode: patch.errorCode || null }, transaction });
        return true;
      });
    },
  };
}
export async function dispatchReliableNotifications({ organizationIds = [], limit = MAX_BATCH, now = () => new Date(), store, sender = sendGenericSesNotification } = {}) {
  return processNotificationBatch({ store: store || createNotificationStore({ organizationIds }), sender, limit, now });
}
