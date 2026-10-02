import crypto from 'node:crypto';
import axios from 'axios';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Op } from 'sequelize';
import { PlatformSetting, PublicLead, PulseLeadConsent, PulseLeadNotification, PulseLeadResult, PulseLeadSession } from '../models/index.js';
import { env } from '../config/env.js';
import { brandedEmail, escapeEmailHtml, quartermark } from './emailBranding.js';
import { decryptConfiguration } from './encryption.js';

const ROUTING_SETTING_KEY = 'portfolio_readiness_pulse_routing';
const MAX_ATTEMPTS = 3;
const contactMailbox = () => Buffer.from('aGVsbG9AYmlnbGl0dGxlYnVzaW5lc3MuY29t', 'base64').toString('utf8');

function formatScore(value) {
  return `${Number(value || 0)}/100`;
}

function sourceAddress(config) {
  return config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;
}

function emailClient(config) {
  return new SESClient({
    region: config.awsRegion,
    credentials: { accessKeyId: config.awsAccessKeyId, secretAccessKey: config.awsSecretAccessKey },
  });
}

function notificationBackoff(attemptCount) {
  return new Date(Date.now() + (15 * (attemptCount + 1) * 60 * 1000));
}

function isValidWebhookUrl(value) {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (env.isProduction) return url.protocol === 'https:';
    return ['https:', 'http:'].includes(url.protocol) && !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

export async function getPulseRoutingSettings({ includeSecrets = false } = {}) {
  const record = await PlatformSetting.findOne({ where: { settingKey: ROUTING_SETTING_KEY } });
  const configuration = record?.configuration || {};
  const secrets = record?.encryptedPayload ? decryptConfiguration(record.encryptedPayload) : {};
  const data = {
    emailEnabled: Boolean(configuration.emailEnabled),
    awsRegion: configuration.awsRegion || 'ap-southeast-2',
    fromName: configuration.fromName || 'CivicPath',
    crmWebhookEnabled: Boolean(configuration.crmWebhookEnabled),
    crmWebhookConfigured: Boolean(secrets.crmWebhookUrl && secrets.crmWebhookSecret),
    awsCredentialsConfigured: Boolean(secrets.awsAccessKeyId && secrets.awsSecretAccessKey),
  };
  const protectedMailboxConfig = { fromEmail: contactMailbox(), replyToEmail: contactMailbox(), internalLeadAlertEmail: contactMailbox() };
  return includeSecrets ? { ...data, ...protectedMailboxConfig, ...secrets } : data;
}

export function resultEmail({ lead, result }) {
  const actionRows = (result.actions || []).map((action, index) => `<li style="margin:0 0 10px"><strong>${index + 1}. ${escapeEmailHtml(action.title)}</strong><br><span style="color:${quartermark.muted}">${escapeEmailHtml(action.text)}</span></li>`).join('');
  const dimensionRows = [
    ['Portfolio visibility', result.portfolioVisibilityScore],
    ['Strategic connection', result.strategicConnectionScore],
    ['Decision readiness', result.decisionReadinessScore],
  ].map(([label, score]) => `<tr><td style="padding:10px 0;border-bottom:1px solid ${quartermark.line};color:${quartermark.muted}">${label}</td><td style="padding:10px 0;border-bottom:1px solid ${quartermark.line};text-align:right;color:${quartermark.deepTeal};font-weight:700">${formatScore(score)}</td></tr>`).join('');
  const subject = 'CivicPath - Your Portfolio Readiness Snapshot';
  const text = `Hi ${lead.firstName},\n\nThank you for completing the CivicPath Council Portfolio Readiness Pulse.\n\nYour result: ${result.bandLabel}\nPortfolio visibility: ${formatScore(result.portfolioVisibilityScore)}\nStrategic connection: ${formatScore(result.strategicConnectionScore)}\nDecision readiness: ${formatScore(result.decisionReadinessScore)}\n\n${result.summary}\n\nYour three practical next actions:\n${(result.actions || []).map((action, index) => `${index + 1}. ${action.title}: ${action.text}`).join('\n')}\n\nThis snapshot reflects the selections you made. It is not an audit, a funding assessment or a promise of results.\n\nRegards,\nCivicPath`;
  const html = brandedEmail({
    heading: 'Your Portfolio Readiness Snapshot',
    preheader: 'Your Council Portfolio Readiness Pulse result and next actions.',
    contentHtml: `<p style="margin:0 0 18px">Hi ${escapeEmailHtml(lead.firstName)},</p><p style="margin:0 0 18px">Thank you for completing the CivicPath Council Portfolio Readiness Pulse. Your starting-point result is <strong>${escapeEmailHtml(result.bandLabel)}</strong>.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0 22px">${dimensionRows}</table><p style="margin:0 0 18px">${escapeEmailHtml(result.summary)}</p><h2 style="margin:24px 0 12px;color:${quartermark.deepTeal};font-family:Arial,Helvetica,sans-serif;font-size:19px;line-height:1.25">Three practical next actions</h2><ol style="margin:0;padding-left:22px">${actionRows}</ol><p style="margin:24px 0 0;color:${quartermark.muted};font-size:13px">This snapshot reflects the selections you made. It is not an audit, a funding assessment or a promise of results.</p>`,
  });
  return { subject, text, html };
}

export function internalEmail({ lead, result }) {
  const subject = `CivicPath - New Portfolio Readiness Pulse — ${lead.councilName}`;
  const text = `A new Council Portfolio Readiness Pulse has been captured.\n\nCouncil: ${lead.councilName}\nContact: ${lead.firstName} ${lead.lastName}\nRole: ${lead.role}\nWork email: ${lead.email}\nLocation: ${lead.stateRegion}, ${lead.country}\nImmediate use case: ${lead.decisionUseCase}\n\nSnapshot result\n- Portfolio visibility: ${formatScore(result.portfolioVisibilityScore)}\n- Strategic connection: ${formatScore(result.strategicConnectionScore)}\n- Decision readiness: ${formatScore(result.decisionReadinessScore)}\n- Overall: ${formatScore(result.overallScore)} — ${result.bandLabel}\n\nRecommended first action: ${result.actions?.[0]?.title || 'Review the result'}\n`;
  const html = brandedEmail({
    heading: 'New Portfolio Readiness Pulse',
    preheader: `A new Portfolio Readiness Pulse was captured for ${lead.councilName}.`,
    contentHtml: `<p style="margin:0 0 18px"><strong>Council:</strong> ${escapeEmailHtml(lead.councilName)}<br><strong>Contact:</strong> ${escapeEmailHtml(`${lead.firstName} ${lead.lastName}`)}<br><strong>Role:</strong> ${escapeEmailHtml(lead.role)}<br><strong>Work email:</strong> ${escapeEmailHtml(lead.email)}<br><strong>Location:</strong> ${escapeEmailHtml(`${lead.stateRegion}, ${lead.country}`)}<br><strong>Immediate use case:</strong> ${escapeEmailHtml(lead.decisionUseCase)}</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:20px 0"><tr><td style="padding:18px 20px;border-left:4px solid ${quartermark.orange};background:#FCF0E9"><p style="margin:0 0 7px;color:${quartermark.green};font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase">Snapshot result</p><p style="margin:0;line-height:1.65">Portfolio visibility: <strong>${formatScore(result.portfolioVisibilityScore)}</strong><br>Strategic connection: <strong>${formatScore(result.strategicConnectionScore)}</strong><br>Decision readiness: <strong>${formatScore(result.decisionReadinessScore)}</strong><br>Overall: <strong>${formatScore(result.overallScore)} — ${escapeEmailHtml(result.bandLabel)}</strong></p></td></tr></table><p style="margin:0"><strong>Recommended first action:</strong> ${escapeEmailHtml(result.actions?.[0]?.title || 'Review the result')}</p>`,
  });
  return { subject, text, html };
}

async function sendSesEmail({ to, message, config }) {
  const response = await emailClient(config).send(new SendEmailCommand({
    Source: sourceAddress(config),
    ReplyToAddresses: config.replyToEmail ? [config.replyToEmail] : undefined,
    Destination: { ToAddresses: [to] },
    Message: {
      Subject: { Charset: 'UTF-8', Data: message.subject },
      Body: {
        Text: { Charset: 'UTF-8', Data: message.text },
        Html: { Charset: 'UTF-8', Data: message.html },
      },
    },
  }));
  return response.MessageId || '';
}

export function buildCrmWebhookPayload({ lead, session, result, consents, notificationId }) {
  const marketingConsent = consents.find((consent) => consent.consentType === 'marketing_updates');
  return {
    schema_version: 'civicpath.public_lead.v1',
    event: 'public_lead.captured',
    event_id: notificationId,
    occurred_at: new Date().toISOString(),
    source: 'portfolio_readiness_pulse',
    lead: {
      civicpath_lead_id: lead.id,
      first_name: lead.firstName,
      last_name: lead.lastName,
      email: lead.email,
      council_name: lead.councilName,
      country: lead.country,
      state_or_region: lead.stateRegion,
      role: lead.role,
      role_other: lead.roleOther || null,
      lifecycle_status: lead.lifecycleStatus,
      decision_use_case: lead.decisionUseCase,
      decision_use_case_other: lead.decisionUseCaseOther || null,
    },
    pulse: {
      session_id: session.sessionId,
      assessment_version: session.assessmentVersion,
      score_version: result.scoreVersion,
      completed_at: session.completedAt.toISOString(),
      focus_themes: session.responses.portfolioFocus || [],
      constraint_themes: session.responses.constraintThemes || [],
      scores: {
        portfolio_visibility: result.portfolioVisibilityScore,
        strategic_connection: result.strategicConnectionScore,
        decision_readiness: result.decisionReadinessScore,
        overall: result.overallScore,
        band_code: result.bandCode,
        band_label: result.bandLabel,
      },
      recommended_actions: (result.actions || []).map((action) => ({ title: action.title, text: action.text })),
    },
    consent: {
      resource_request: true,
      marketing_updates: Boolean(marketingConsent?.granted),
      policy_version: marketingConsent?.policyVersion || null,
    },
  };
}

async function markSent(notification, details = {}) {
  await notification.update({ status: 'sent', attemptCount: notification.attemptCount + 1, lastAttemptAt: new Date(), deliveredAt: new Date(), nextAttemptAt: null, lastError: null, ...details });
}

async function markFailure(notification, error, details = {}) {
  const nextAttempt = notification.attemptCount + 1;
  const finalFailure = nextAttempt >= MAX_ATTEMPTS;
  await notification.update({
    status: finalFailure ? 'failed' : 'pending',
    attemptCount: nextAttempt,
    lastAttemptAt: new Date(),
    nextAttemptAt: finalFailure ? null : notificationBackoff(notification.attemptCount),
    lastError: String(error.message || error).slice(0, 1000),
    ...details,
  });
}

async function dispatchNotification(notification, context, config) {
  const { lead, session, result, consents } = context;
  if (notification.notificationType === 'recipient_email') {
    if (!config.emailEnabled || !config.awsCredentialsConfigured || !config.fromEmail) return notification.update({ status: 'disabled', lastError: 'Transactional email is not configured.' });
    try {
      const providerReference = await sendSesEmail({ to: lead.email, message: resultEmail({ lead, result }), config });
      return markSent(notification, { providerReference });
    } catch (error) { return markFailure(notification, error); }
  }
  if (notification.notificationType === 'internal_alert') {
    if (!config.emailEnabled || !config.awsCredentialsConfigured || !config.fromEmail || !config.internalLeadAlertEmail) return notification.update({ status: 'disabled', lastError: 'Internal lead-alert email is not configured.' });
    try {
      const providerReference = await sendSesEmail({ to: config.internalLeadAlertEmail, message: internalEmail({ lead, result }), config });
      return markSent(notification, { providerReference });
    } catch (error) { return markFailure(notification, error); }
  }
  if (notification.notificationType === 'crm_webhook') {
    if (!config.crmWebhookEnabled || !config.crmWebhookUrl || !config.crmWebhookSecret) return notification.update({ status: 'disabled', lastError: 'CRM webhook is not configured.' });
    if (!isValidWebhookUrl(config.crmWebhookUrl)) return notification.update({ status: 'failed', lastError: 'CRM webhook URL is invalid or does not meet the HTTPS requirement.' });
    const payload = buildCrmWebhookPayload({ lead, session, result, consents, notificationId: notification.id });
    try {
      const signature = crypto.createHmac('sha256', config.crmWebhookSecret).update(JSON.stringify(payload)).digest('hex');
      const response = await axios.post(config.crmWebhookUrl, payload, { timeout: 10000, headers: { 'Content-Type': 'application/json', 'User-Agent': 'CivicPath-Pulse/1.0', 'X-CivicPath-Event': 'public_lead.captured', 'X-CivicPath-Delivery': notification.id, 'X-CivicPath-Signature': `sha256=${signature}` }, validateStatus: () => true });
      if (response.status < 200 || response.status >= 300) throw new Error(`CRM webhook returned HTTP ${response.status}`);
      return markSent(notification, { responseStatus: response.status, payload });
    } catch (error) { return markFailure(notification, error, { payload }); }
  }
  return null;
}

async function notificationContext(notification) {
  const [lead, session, result, consents] = await Promise.all([
    PublicLead.findByPk(notification.leadId),
    PulseLeadSession.findOne({ where: { sessionId: notification.sessionId } }),
    PulseLeadResult.findOne({ where: { sessionId: notification.sessionId } }),
    PulseLeadConsent.findAll({ where: { sessionId: notification.sessionId } }),
  ]);
  if (!lead || !session || !result) throw new Error('Pulse notification context is incomplete.');
  return { lead, session, result, consents };
}

export async function dispatchPulseNotifications(sessionId) {
  const config = await getPulseRoutingSettings({ includeSecrets: true });
  const notifications = await PulseLeadNotification.findAll({ where: { sessionId, status: { [Op.in]: ['pending', 'sending'] } } });
  for (const notification of notifications) {
    const context = await notificationContext(notification);
    await dispatchNotification(notification, context, config);
  }
  return PulseLeadNotification.findAll({ where: { sessionId }, order: [['createdAt', 'ASC']] });
}

export async function retryPendingPulseNotifications() {
  const due = await PulseLeadNotification.findAll({ where: { status: 'pending', nextAttemptAt: { [Op.lte]: new Date() } }, limit: 50, order: [['nextAttemptAt', 'ASC']] });
  const sessionIds = [...new Set(due.map((notification) => notification.sessionId))];
  for (const sessionId of sessionIds) await dispatchPulseNotifications(sessionId);
  return { attempted: due.length };
}

export const pulseRoutingSettingKey = ROUTING_SETTING_KEY;
