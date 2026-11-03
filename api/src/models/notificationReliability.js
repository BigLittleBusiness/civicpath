import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const standard = { timestamps: true, underscored: true, paranoid: false };
const id = () => ({ type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 });
const org = () => ({ type: DataTypes.UUID, allowNull: false, references: { model: 'Organization', key: 'id' }, onDelete: 'RESTRICT' });
const user = () => ({ type: DataTypes.UUID, allowNull: false, references: { model: 'User', key: 'id' }, onDelete: 'RESTRICT' });
export const NotificationPreference = sequelize.define('NotificationPreference', {
  id: id(), organizationId: org(), userId: user(), emailEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  frequency: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'daily' }, quietStart: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '20:00' },
  quietEnd: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '08:00' }, timezone: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'UTC' },
  consentAt: { type: DataTypes.DATE, allowNull: true },
}, { ...standard, indexes: [{ name: 'nr_pref_org_user', unique: true, fields: ['organization_id', 'user_id'] }] });
export const OrganizationNotificationPolicy = sequelize.define('OrganizationNotificationPolicy', {
  id: id(), organizationId: org(), emailEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  digestsEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, remindersEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, { ...standard, indexes: [{ name: 'nr_policy_org', unique: true, fields: ['organization_id'] }] });
export const NotificationOutbox = sequelize.define('NotificationOutbox', {
  id: id(), organizationId: org(), userId: user(), eventKey: { type: DataTypes.STRING(64), allowNull: false },
  kind: { type: DataTypes.STRING(40), allowNull: false }, channel: { type: DataTypes.STRING(12), allowNull: false },
  sourceType: { type: DataTypes.STRING(40), allowNull: false }, sourceId: { type: DataTypes.UUID, allowNull: false },
  frequency: { type: DataTypes.STRING(12), allowNull: true }, timezone: { type: DataTypes.STRING(80), allowNull: true },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'pending' }, availableAt: { type: DataTypes.DATE, allowNull: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false }, attemptCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  leaseToken: { type: DataTypes.UUID, allowNull: true }, leaseUntil: { type: DataTypes.DATE, allowNull: true },
  providerReference: { type: DataTypes.STRING(255), allowNull: true }, errorCode: { type: DataTypes.STRING(80), allowNull: true }, readAt: { type: DataTypes.DATE, allowNull: true },
}, { ...standard, indexes: [
  { name: 'nr_outbox_event', unique: true, fields: ['organization_id', 'user_id', 'channel', 'event_key'] },
  { name: 'nr_outbox_claim', fields: ['organization_id', 'status', 'available_at', 'lease_until'] },
  { name: 'nr_outbox_recover', fields: ['organization_id', 'status', 'lease_until'] },
  { name: 'nr_outbox_inbox', fields: ['organization_id', 'user_id', 'channel', 'status', 'created_at', 'id'] },
  { name: 'nr_outbox_provider', fields: ['provider_reference'] },
] });
export const ReliableNotificationDelivery = sequelize.define('ReliableNotificationDelivery', {
  id: id(), organizationId: { ...org(), allowNull: true }, userId: { ...user(), allowNull: true }, outboxId: { type: DataTypes.UUID, allowNull: true, references: { model: 'NotificationOutbox', key: 'id' }, onDelete: 'RESTRICT' },
  attempt: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 }, category: { type: DataTypes.STRING(80), allowNull: false },
  recipientHash: { type: DataTypes.STRING(64), allowNull: false }, status: { type: DataTypes.STRING(24), allowNull: false },
  providerReference: { type: DataTypes.STRING(255), allowNull: true }, errorCode: { type: DataTypes.STRING(80), allowNull: true },
}, { ...standard, indexes: [
  { name: 'nr_delivery_attempt', unique: true, fields: ['outbox_id', 'attempt'] },
  { name: 'nr_delivery_provider', fields: ['provider_reference'] },
  { name: 'nr_delivery_org', fields: ['organization_id', 'created_at'] },
] });
// Global recipient hash suppression intentionally follows an address across tenant memberships.
export const NotificationRecipientSuppression = sequelize.define('NotificationRecipientSuppression', {
  id: id(), recipientHash: { type: DataTypes.STRING(64), allowNull: false }, reason: { type: DataTypes.STRING(24), allowNull: false },
}, { ...standard, indexes: [{ name: 'nr_suppression_hash', unique: true, fields: ['recipient_hash'] }] });
export const NotificationFeedbackEvent = sequelize.define('NotificationFeedbackEvent', {
  id: id(), eventHash: { type: DataTypes.STRING(64), allowNull: false }, providerReference: { type: DataTypes.STRING(255), allowNull: false },
  outcome: { type: DataTypes.STRING(24), allowNull: false }, occurredAt: { type: DataTypes.DATE, allowNull: false },
}, { ...standard, indexes: [{ name: 'nr_feedback_event', unique: true, fields: ['event_hash'] }] });
export const notificationModels = [NotificationPreference, OrganizationNotificationPolicy, NotificationOutbox, ReliableNotificationDelivery, NotificationRecipientSuppression, NotificationFeedbackEvent];
