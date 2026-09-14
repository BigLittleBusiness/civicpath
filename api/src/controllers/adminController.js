import Joi from 'joi';
import { Op } from 'sequelize';
import { Organization, User, Subscription, ProductPlan, PlatformSetting, SupportCase, AuditLog } from '../models/index.js';
import { decryptConfiguration, encryptConfiguration } from '../services/encryption.js';
import { env } from '../config/env.js';

const stripeSchema = Joi.object({
  mode: Joi.string().valid('test', 'live').default('test'),
  publishableKey: Joi.string().trim().allow('', null),
  secretKey: Joi.string().trim().allow('', null),
  webhookSecret: Joi.string().trim().allow('', null),
  corePriceId: Joi.string().trim().allow('', null),
  essentialsPriceId: Joi.string().trim().allow('', null),
  grantmaestroPriceId: Joi.string().trim().allow('', null),
});

function mask(value) { return value ? `${value.slice(0, 7)}••••${value.slice(-4)}` : ''; }
function platformAudit(req, action, metadata = {}) { return AuditLog.create({ organizationId: req.auth.organizationId, userId: req.auth.sub, entityType: 'platform_admin', action, metadata, ipAddress: req.ip }).catch(() => null); }

export async function platformOverview(req, res, next) {
  try {
    const [customers, users, activeSubscriptions, openCases, urgentCases, stripeSetting, recentAudit] = await Promise.all([
      Organization.count({ where: { organisationType: { [Op.in]: ['council', 'joint_organisation'] } } }),
      User.count({ where: { role: { [Op.ne]: 'platform_admin' } } }),
      Subscription.count({ where: { status: { [Op.in]: ['trial', 'active', 'past_due'] } } }),
      SupportCase.count({ where: { status: { [Op.in]: ['new', 'in_progress', 'waiting_customer'] } } }),
      SupportCase.count({ where: { priority: 'urgent', status: { [Op.notIn]: ['resolved', 'closed'] } } }),
      PlatformSetting.findOne({ where: { settingKey: 'stripe_billing' } }),
      AuditLog.findAll({ order: [['createdAt', 'DESC']], limit: 12, attributes: ['action', 'entityType', 'createdAt', 'organizationId', 'metadata'] }),
    ]);
    const settings = stripeSetting?.configuration || {};
    return res.json({ data: { metrics: { customers, users, activeSubscriptions, openCases, urgentCases, stripeConfigured: Boolean(settings.configured) }, actionQueue: [urgentCases && { title: `${urgentCases} urgent support case${urgentCases === 1 ? '' : 's'}`, type: 'support', priority: 'urgent' }, !settings.configured && { title: 'Stripe billing is not configured', type: 'billing', priority: 'normal' }, openCases === 0 && { title: 'No active support cases', type: 'support', priority: 'complete' }].filter(Boolean), recentAudit } });
  } catch (error) { return next(error); }
}

export async function listCustomers(req, res, next) {
  try {
    const organisationTypes = env.demoMode ? ['council', 'joint_organisation', 'demo'] : ['council', 'joint_organisation'];
    const customers = await Organization.findAll({ where: { organisationType: { [Op.in]: organisationTypes } }, include: [{ model: Subscription, include: [{ model: ProductPlan }] }, { model: User, attributes: ['id', 'status'] }], order: [['createdAt', 'DESC']] });
    return res.json({ data: customers.map((customer) => ({ id: customer.id, name: customer.name, country: customer.country, status: customer.status, plan: customer.Subscriptions?.[0]?.ProductPlan?.name || 'No subscription', subscriptionStatus: customer.Subscriptions?.[0]?.status || 'not_started', users: customer.Users?.filter((user) => user.status === 'active').length || 0, isDemo: customer.isDemo, createdAt: customer.createdAt })) });
  } catch (error) { return next(error); }
}

export async function listSupportCases(req, res, next) { try { const records = await SupportCase.findAll({ include: [{ model: Organization, attributes: ['name', 'country'] }], order: [['priority', 'DESC'], ['createdAt', 'DESC']], limit: 100 }); return res.json({ data: records }); } catch (error) { return next(error); } }

export async function updateSupportCase(req, res, next) { try { const schema = Joi.object({ status: Joi.string().valid('new', 'in_progress', 'waiting_customer', 'resolved', 'closed'), priority: Joi.string().valid('low', 'normal', 'high', 'urgent') }); const { value, error } = schema.validate(req.body, { stripUnknown: true }); if (error) return res.status(422).json({ error: error.message }); const record = await SupportCase.findByPk(req.params.caseId); if (!record) return res.status(404).json({ error: 'Support case not found.' }); await record.update({ ...value, resolvedAt: ['resolved', 'closed'].includes(value.status) ? new Date() : record.resolvedAt, ownerId: req.auth.sub }); await platformAudit(req, 'support_case_updated', { caseId: record.id, status: record.status }); return res.json({ data: record }); } catch (error) { return next(error); } }

export async function getStripeSettings(req, res, next) {
  try { const setting = await PlatformSetting.findOne({ where: { settingKey: 'stripe_billing' } }); const publicConfig = setting?.configuration || {}; const secretConfig = setting?.encryptedPayload ? decryptConfiguration(setting.encryptedPayload) : {}; return res.json({ data: { mode: publicConfig.mode || 'test', publishableKey: mask(publicConfig.publishableKey), corePriceId: publicConfig.corePriceId || '', essentialsPriceId: publicConfig.essentialsPriceId || '', grantmaestroPriceId: publicConfig.grantmaestroPriceId || '', configured: Boolean(publicConfig.configured), secretKeyConfigured: Boolean(secretConfig.secretKey), webhookSecretConfigured: Boolean(secretConfig.webhookSecret) } }); } catch (error) { return next(error); }
}

export async function saveStripeSettings(req, res, next) {
  try {
    const { value, error } = stripeSchema.validate(req.body, { stripUnknown: true }); if (error) return res.status(422).json({ error: error.message });
    if ((value.secretKey || value.webhookSecret) && !env.platformEncryptionKey) return res.status(422).json({ error: 'A platform encryption key must be configured before Stripe secrets can be saved.' });
    const setting = await PlatformSetting.findOne({ where: { settingKey: 'stripe_billing' } }); const existingSecrets = setting?.encryptedPayload ? decryptConfiguration(setting.encryptedPayload) : {};
    const secretKey = value.secretKey || existingSecrets.secretKey || ''; const webhookSecret = value.webhookSecret || existingSecrets.webhookSecret || '';
    const configuration = { mode: value.mode, publishableKey: value.publishableKey || setting?.configuration?.publishableKey || '', corePriceId: value.corePriceId, essentialsPriceId: value.essentialsPriceId, grantmaestroPriceId: value.grantmaestroPriceId, configured: Boolean(value.publishableKey && secretKey && webhookSecret) };
    const encryptedPayload = (secretKey || webhookSecret) ? encryptConfiguration({ secretKey, webhookSecret }) : null;
    const [record] = await PlatformSetting.upsert({ id: setting?.id, settingKey: 'stripe_billing', configuration, encryptedPayload, updatedBy: req.auth.sub });
    await platformAudit(req, 'stripe_settings_saved', { mode: configuration.mode, configured: configuration.configured });
    return res.json({ data: { mode: configuration.mode, publishableKey: mask(configuration.publishableKey), corePriceId: configuration.corePriceId, essentialsPriceId: configuration.essentialsPriceId, grantmaestroPriceId: configuration.grantmaestroPriceId, configured: configuration.configured, secretKeyConfigured: Boolean(secretKey), webhookSecretConfigured: Boolean(webhookSecret) } });
  } catch (error) { return next(error); }
}

export async function listPlans(req, res, next) { try { return res.json({ data: await ProductPlan.findAll({ order: [['product', 'ASC'], ['annualPriceAud', 'ASC']] }) }); } catch (error) { return next(error); } }
