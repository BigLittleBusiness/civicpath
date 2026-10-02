import Joi from 'joi';
import { Op } from 'sequelize';
import { Organization, User, Subscription, ProductPlan, PlatformSetting, SupportCase, SupportAttachment, AuditLog, BillingProfile, BillingInvoice } from '../models/index.js';
import { pickCurrentSubscription, priceWithGst, subscriptionView } from '../services/billingSummary.js';
import { decryptConfiguration, encryptConfiguration } from '../services/encryption.js';
import { env } from '../config/env.js';

const stripeSchema = Joi.object({
  mode: Joi.string().valid('test', 'live').default('test'),
  publishableKey: Joi.string().trim().allow('', null),
  secretKey: Joi.string().trim().allow('', null),
  webhookSecret: Joi.string().trim().allow('', null),
  proofPriceId: Joi.string().trim().allow('', null),
  corePriceId: Joi.string().trim().allow('', null),
  essentialsPriceId: Joi.string().trim().allow('', null),
  grantmaestroPriceId: Joi.string().trim().allow('', null),
  customerPortalConfigurationId: Joi.string().trim().allow('', null),
  automaticTaxEnabled: Joi.boolean().default(false),
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
    const billing = await billingMetrics();
    const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
    const actionQueue = [
      urgentCases && { title: `${plural(urgentCases, 'urgent support case')}`, type: 'support', priority: 'urgent' },
      billing.pastDue && { title: `${plural(billing.pastDue, 'council')} with a failed payment`, type: 'billing', priority: 'urgent' },
      billing.proofsEndingSoon && { title: `${plural(billing.proofsEndingSoon, 'Council Proof')} ending within 14 days`, type: 'conversion', priority: 'normal' },
      billing.cancellingAtPeriodEnd && { title: `${plural(billing.cancellingAtPeriodEnd, 'subscription')} set to cancel at period end`, type: 'retention', priority: 'normal' },
      billing.pendingCheckout && { title: `${plural(billing.pendingCheckout, 'registration')} awaiting checkout`, type: 'billing', priority: 'normal' },
      !settings.configured && { title: 'Stripe billing is not configured', type: 'billing', priority: 'normal' },
      openCases === 0 && { title: 'No active support cases', type: 'support', priority: 'complete' },
    ].filter(Boolean);
    return res.json({ data: { metrics: { customers, users, activeSubscriptions, openCases, urgentCases, stripeConfigured: Boolean(settings.configured), stripeMode: settings.mode || 'test', ...billing }, actionQueue, recentAudit } });
  } catch (error) { return next(error); }
}

// Revenue and subscription health across billable councils (demonstration and platform tenants excluded).
async function billingMetrics(now = new Date()) {
  const organisations = await Organization.findAll({ where: { organisationType: { [Op.in]: ['council', 'joint_organisation'] }, isDemo: false }, attributes: ['id'], include: [{ model: Subscription, include: [{ model: ProductPlan }] }] });
  const current = organisations.map((organisation) => subscriptionView(pickCurrentSubscription(organisation.Subscriptions || []), { now })).filter(Boolean);
  const active = current.filter((item) => item.accessActive);
  const within = (item, days) => item.endsAt && item.endsAt - now <= days * 86_400_000;
  const since = new Date(now.getTime() - 30 * 86_400_000);
  const collected = await BillingInvoice.sum('amountPaid', { where: { status: 'paid', paidAt: { [Op.gte]: since } } });
  return {
    annualRecurringRevenueAud: active.filter((item) => item.billingInterval === 'annual' && item.isBilled && !item.cancelAtPeriodEnd).reduce((sum, item) => sum + (item.annualPriceAud || 0), 0),
    activeAnnual: active.filter((item) => item.billingInterval === 'annual').length,
    activeProofs: active.filter((item) => item.billingInterval === 'one_off').length,
    proofsEndingSoon: active.filter((item) => item.billingInterval === 'one_off' && within(item, 14)).length,
    renewingSoon: active.filter((item) => item.renews && within(item, 30)).length,
    cancellingAtPeriodEnd: active.filter((item) => item.cancelAtPeriodEnd).length,
    pastDue: current.filter((item) => item.status === 'past_due').length,
    pendingCheckout: current.filter((item) => item.status === 'pending_checkout').length,
    collectedLast30DaysCents: Number(collected || 0),
  };
}

export async function listCustomers(req, res, next) {
  try {
    const organisationTypes = env.demoMode ? ['council', 'joint_organisation', 'demo'] : ['council', 'joint_organisation'];
    const customers = await Organization.findAll({ where: { organisationType: { [Op.in]: organisationTypes } }, include: [{ model: Subscription, include: [{ model: ProductPlan }] }, { model: User, attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'status', 'lastLoginAt', 'createdAt'] }, { model: BillingProfile, attributes: ['billingEmail', 'stripeCustomerId', 'billingAddress'] }], order: [['createdAt', 'DESC']] });
    const paidInvoices = await BillingInvoice.findAll({ attributes: ['organizationId', 'paidAt', 'amountPaid', 'currency'], where: { organizationId: customers.map((customer) => customer.id), status: 'paid' }, order: [['paidAt', 'DESC']] });
    const lastPaymentByOrganisation = new Map();
    for (const invoice of paidInvoices) if (!lastPaymentByOrganisation.has(invoice.organizationId)) lastPaymentByOrganisation.set(invoice.organizationId, invoice);
    return res.json({ data: customers.map((customer) => {
      const subscription = subscriptionView(pickCurrentSubscription(customer.Subscriptions || []));
      const users = customer.Users || [];
      const admin = users.filter((user) => user.role === 'org_admin').sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))[0] || null;
      const payment = lastPaymentByOrganisation.get(customer.id);
      return {
        id: customer.id, name: customer.name, country: customer.country, status: customer.status, isDemo: customer.isDemo, createdAt: customer.createdAt,
        plan: subscription?.planName || 'No subscription', planCode: subscription?.planCode || null, subscriptionStatus: subscription?.status || 'not_started', subscription,
        pricing: priceWithGst(subscription?.annualPriceAud ?? null, customer.BillingProfile?.billingAddress?.country || customer.country),
        users: users.filter((user) => user.status === 'active').length,
        userCounts: { active: users.filter((user) => user.status === 'active').length, invited: users.filter((user) => user.status === 'invited').length, total: users.length },
        primaryAdmin: admin ? { name: `${admin.firstName} ${admin.lastName}`.trim(), email: admin.email, lastLoginAt: admin.lastLoginAt } : null,
        billingEmail: customer.BillingProfile?.billingEmail || null,
        stripeCustomerId: customer.BillingProfile?.stripeCustomerId || null,
        lastPayment: payment ? { paidAt: payment.paidAt, amount: payment.amountPaid, currency: payment.currency } : null,
      };
    }) });
  } catch (error) { return next(error); }
}

export async function listSupportCases(req, res, next) { try { const records = await SupportCase.findAll({ include: [{ model: Organization, attributes: ['name', 'country'] }, { model: SupportAttachment, attributes: ['id', 'originalFilename', 'contentType', 'sizeBytes', 'createdAt'] }], order: [['priority', 'DESC'], ['createdAt', 'DESC']], limit: 100 }); return res.json({ data: records }); } catch (error) { return next(error); } }

export async function updateSupportCase(req, res, next) { try { const schema = Joi.object({ status: Joi.string().valid('new', 'in_progress', 'waiting_customer', 'resolved', 'closed'), priority: Joi.string().valid('low', 'normal', 'high', 'urgent') }); const { value, error } = schema.validate(req.body, { stripUnknown: true }); if (error) return res.status(422).json({ error: error.message }); const record = await SupportCase.findByPk(req.params.caseId); if (!record) return res.status(404).json({ error: 'Support case not found.' }); await record.update({ ...value, resolvedAt: ['resolved', 'closed'].includes(value.status) ? new Date() : record.resolvedAt, ownerId: req.auth.sub }); await platformAudit(req, 'support_case_updated', { caseId: record.id, status: record.status }); return res.json({ data: record }); } catch (error) { return next(error); } }

export async function getStripeSettings(req, res, next) {
  try { const setting = await PlatformSetting.findOne({ where: { settingKey: 'stripe_billing' } }); const publicConfig = setting?.configuration || {}; const secretConfig = setting?.encryptedPayload ? decryptConfiguration(setting.encryptedPayload) : {}; return res.json({ data: { mode: publicConfig.mode || 'test', publishableKey: mask(publicConfig.publishableKey), proofPriceId: publicConfig.proofPriceId || '', corePriceId: publicConfig.corePriceId || '', essentialsPriceId: publicConfig.essentialsPriceId || '', grantmaestroPriceId: publicConfig.grantmaestroPriceId || '', customerPortalConfigurationId: publicConfig.customerPortalConfigurationId || '', automaticTaxEnabled: Boolean(publicConfig.automaticTaxEnabled), configured: Boolean(publicConfig.configured), secretKeyConfigured: Boolean(secretConfig.secretKey), webhookSecretConfigured: Boolean(secretConfig.webhookSecret) } }); } catch (error) { return next(error); }
}

export async function saveStripeSettings(req, res, next) {
  try {
    const { value, error } = stripeSchema.validate(req.body, { stripUnknown: true }); if (error) return res.status(422).json({ error: error.message });
    if ((value.secretKey || value.webhookSecret) && !env.platformEncryptionKey) return res.status(422).json({ error: 'A platform encryption key must be configured before Stripe secrets can be saved.' });
    const setting = await PlatformSetting.findOne({ where: { settingKey: 'stripe_billing' } }); const existingSecrets = setting?.encryptedPayload ? decryptConfiguration(setting.encryptedPayload) : {};
    const secretKey = value.secretKey || existingSecrets.secretKey || ''; const webhookSecret = value.webhookSecret || existingSecrets.webhookSecret || '';
    const existingPublishableKey = setting?.configuration?.publishableKey || '';
    const publishableKey = value.publishableKey?.includes('••••') ? existingPublishableKey : value.publishableKey || existingPublishableKey;
    const configuration = { mode: value.mode, publishableKey, proofPriceId: value.proofPriceId, corePriceId: value.corePriceId, essentialsPriceId: value.essentialsPriceId, grantmaestroPriceId: value.grantmaestroPriceId, customerPortalConfigurationId: value.customerPortalConfigurationId, automaticTaxEnabled: value.automaticTaxEnabled, configured: Boolean(publishableKey && secretKey && webhookSecret) };
    const encryptedPayload = (secretKey || webhookSecret) ? encryptConfiguration({ secretKey, webhookSecret }) : null;
    const [record] = await PlatformSetting.upsert({ id: setting?.id, settingKey: 'stripe_billing', configuration, encryptedPayload, updatedBy: req.auth.sub });
    await platformAudit(req, 'stripe_settings_saved', { mode: configuration.mode, configured: configuration.configured });
    return res.json({ data: { mode: configuration.mode, publishableKey: mask(configuration.publishableKey), proofPriceId: configuration.proofPriceId, corePriceId: configuration.corePriceId, essentialsPriceId: configuration.essentialsPriceId, grantmaestroPriceId: configuration.grantmaestroPriceId, customerPortalConfigurationId: configuration.customerPortalConfigurationId, automaticTaxEnabled: configuration.automaticTaxEnabled, configured: configuration.configured, secretKeyConfigured: Boolean(secretKey), webhookSecretConfigured: Boolean(webhookSecret) } });
  } catch (error) { return next(error); }
}

export async function listPlans(req, res, next) { try { return res.json({ data: await ProductPlan.findAll({ order: [['product', 'ASC'], ['annualPriceAud', 'ASC']] }) }); } catch (error) { return next(error); } }
