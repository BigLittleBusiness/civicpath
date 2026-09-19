import Joi from 'joi';
import { Op } from 'sequelize';
import { AuditLog, PlatformSetting, PublicLead, PulseLeadConsent, PulseLeadNotification, PulseLeadResult, PulseLeadSession } from '../models/index.js';
import { decryptConfiguration, encryptConfiguration } from '../services/encryption.js';
import { getPulseRoutingSettings, pulseRoutingSettingKey } from '../services/pulseNotifications.js';
import { env } from '../config/env.js';

const settingsSchema = Joi.object({
  emailEnabled: Joi.boolean().default(false),
  awsRegion: Joi.string().trim().max(80).default('ap-southeast-2'),
  fromName: Joi.string().trim().max(120).default('CivicPath'),
  fromEmail: Joi.string().trim().email().allow('', null),
  replyToEmail: Joi.string().trim().email().allow('', null),
  internalLeadAlertEmail: Joi.string().trim().email().allow('', null),
  awsAccessKeyId: Joi.string().trim().max(200).allow('', null),
  awsSecretAccessKey: Joi.string().trim().max(200).allow('', null),
  crmWebhookEnabled: Joi.boolean().default(false),
  crmWebhookUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(1000).allow('', null),
  crmWebhookSecret: Joi.string().trim().min(16).max(500).allow('', null),
}).custom((value, helpers) => {
  if (value.emailEnabled && (!value.fromEmail || !value.internalLeadAlertEmail)) return helpers.error('any.custom', { message: 'A From email and internal lead-alert email are required before transactional email can be enabled.' });
  if (value.crmWebhookEnabled && (!value.crmWebhookUrl || !value.crmWebhookSecret)) return helpers.error('any.custom', { message: 'A webhook URL and signing secret are required before CRM routing can be enabled.' });
  if (env.isProduction && value.crmWebhookEnabled && value.crmWebhookUrl && !value.crmWebhookUrl.startsWith('https://')) return helpers.error('any.custom', { message: 'CRM webhook URLs must use HTTPS in production.' });
  return value;
}, 'Pulse routing settings validation');

function mask(value) {
  return value ? `${value.slice(0, Math.min(5, value.length))}••••${value.slice(-3)}` : '';
}

async function audit(req, action, metadata = {}) {
  return AuditLog.create({ organizationId: req.auth.organizationId, userId: req.auth.sub, entityType: 'portfolio_readiness_pulse', action, metadata, ipAddress: req.ip }).catch(() => null);
}

export async function getPulseRouting(req, res, next) {
  try { return res.json({ data: await getPulseRoutingSettings() }); } catch (error) { return next(error); }
}

export async function savePulseRouting(req, res, next) {
  try {
    const { value, error } = settingsSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(422).json({ error: 'Please review the lead-routing settings.', details: error.details.map((item) => item.message) });
    if ((value.awsAccessKeyId || value.awsSecretAccessKey || value.crmWebhookUrl || value.crmWebhookSecret) && !env.platformEncryptionKey) return res.status(422).json({ error: 'A platform encryption key must be configured before lead-routing secrets can be saved.' });
    const existing = await PlatformSetting.findOne({ where: { settingKey: pulseRoutingSettingKey } });
    const priorSecrets = existing?.encryptedPayload ? decryptConfiguration(existing.encryptedPayload) : {};
    const secrets = {
      awsAccessKeyId: value.awsAccessKeyId || priorSecrets.awsAccessKeyId || '',
      awsSecretAccessKey: value.awsSecretAccessKey || priorSecrets.awsSecretAccessKey || '',
      crmWebhookUrl: value.crmWebhookUrl || priorSecrets.crmWebhookUrl || '',
      crmWebhookSecret: value.crmWebhookSecret || priorSecrets.crmWebhookSecret || '',
    };
    const configuration = {
      emailEnabled: value.emailEnabled,
      awsRegion: value.awsRegion,
      fromName: value.fromName,
      fromEmail: value.fromEmail || '',
      replyToEmail: value.replyToEmail || '',
      internalLeadAlertEmail: value.internalLeadAlertEmail || '',
      crmWebhookEnabled: value.crmWebhookEnabled,
    };
    await PlatformSetting.upsert({ id: existing?.id, settingKey: pulseRoutingSettingKey, configuration, encryptedPayload: Object.values(secrets).some(Boolean) ? encryptConfiguration(secrets) : null, updatedBy: req.auth.sub });
    await audit(req, 'pulse_lead_routing_saved', { emailEnabled: configuration.emailEnabled, crmWebhookEnabled: configuration.crmWebhookEnabled, awsRegion: configuration.awsRegion, hasEmailCredentials: Boolean(secrets.awsAccessKeyId && secrets.awsSecretAccessKey), hasCrmWebhook: Boolean(secrets.crmWebhookUrl && secrets.crmWebhookSecret) });
    return res.json({ data: await getPulseRoutingSettings() });
  } catch (error) { return next(error); }
}

export async function listPulseLeads(req, res, next) {
  try {
    const query = String(req.query.q || '').trim();
    const where = query ? { [Op.or]: [{ councilName: { [Op.like]: `%${query}%` } }, { email: { [Op.like]: `%${query}%` } }, { firstName: { [Op.like]: `%${query}%` } }, { lastName: { [Op.like]: `%${query}%` } }] } : {};
    const leads = await PublicLead.findAll({
      where,
      include: [
        { model: PulseLeadResult, attributes: ['overallScore', 'bandCode', 'bandLabel', 'portfolioVisibilityScore', 'strategicConnectionScore', 'decisionReadinessScore', 'actions', 'createdAt'], separate: true, limit: 1, order: [['createdAt', 'DESC']] },
        { model: PulseLeadConsent, attributes: ['consentType', 'granted', 'createdAt'], separate: true, order: [['createdAt', 'DESC']] },
        { model: PulseLeadNotification, attributes: ['notificationType', 'status', 'lastError', 'deliveredAt', 'createdAt'], separate: true, order: [['createdAt', 'DESC']] },
      ],
      order: [['lastPulseAt', 'DESC']],
      limit: 100,
    });
    return res.json({ data: leads.map((lead) => ({
      id: lead.id,
      name: `${lead.firstName} ${lead.lastName}`,
      email: lead.email,
      councilName: lead.councilName,
      country: lead.country,
      stateRegion: lead.stateRegion,
      role: lead.role,
      decisionUseCase: lead.decisionUseCase,
      lifecycleStatus: lead.lifecycleStatus,
      lastPulseAt: lead.lastPulseAt,
      latestResult: lead.PulseLeadResults?.[0] || null,
      marketingConsent: Boolean(lead.PulseLeadConsents?.find((item) => item.consentType === 'marketing_updates')?.granted),
      notifications: lead.PulseLeadNotifications || [],
    })) });
  } catch (error) { return next(error); }
}

export const pulseRoutingMasks = Object.freeze({ mask });
