import crypto from 'node:crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { brandedEmail, emailButton, escapeEmailHtml } from './emailBranding.js';
import { getPulseRoutingSettings } from './pulseNotifications.js';
import { NotificationDelivery } from '../models/index.js';

const MAX_ATTEMPTS = 3;
const inboundMailbox = () => Buffer.from('aGVsbG9AYmlnbGl0dGxlYnVzaW5lc3MuY29t', 'base64').toString('utf8');

function sourceAddress(config) {
  return config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;
}

function emailClient(config) {
  return new SESClient({ region: config.awsRegion, credentials: { accessKeyId: config.awsAccessKeyId, secretAccessKey: config.awsSecretAccessKey } });
}

export function registrationReceiptMessage({ firstName, organisationName, planName, checkoutUrl }) {
  const subject = 'CivicPath - Complete your secure subscription checkout';
  const text = `Hi ${firstName},\n\nYour CivicPath registration for ${organisationName} has been received. Complete the secure Stripe checkout for ${planName} to activate your Council workspace:\n${checkoutUrl}\n\nCivicPath access is activated only after Stripe confirms payment. This checkout link is time-limited. If it expires, use the CivicPath contact form and select Billing.\n\nRegards,\nCivicPath`;
  const html = brandedEmail({
    heading: 'Your CivicPath registration is ready',
    preheader: 'Complete the secure checkout to activate your Council workspace.',
    contentHtml: `<p style="margin:0 0 18px">Hi ${escapeEmailHtml(firstName)},</p><p style="margin:0 0 18px">Your registration for <strong>${escapeEmailHtml(organisationName)}</strong> has been received. Complete the secure Stripe checkout for <strong>${escapeEmailHtml(planName)}</strong> to activate your Council workspace.</p>${emailButton({ href: checkoutUrl, label: 'Continue to secure checkout' })}<p style="margin:0">CivicPath access is activated only after Stripe confirms payment. This checkout link is time-limited. If it expires, use the CivicPath contact form and select Billing.</p>`,
  });
  return { subject, text, html };
}

export function accountActivatedMessage({ firstName, organisationName, planName, signInUrl }) {
  const subject = 'CivicPath - Your Council workspace is active';
  const text = `Hi ${firstName},\n\nStripe has confirmed payment and ${organisationName}'s ${planName} workspace is now active.\n\nSign in: ${signInUrl}\n\nYour billing records and invoice history are available from the subscription area of your CivicPath workspace.\n\nRegards,\nCivicPath`;
  const html = brandedEmail({
    heading: 'Your Council workspace is active',
    preheader: 'Stripe has confirmed payment and your CivicPath workspace is ready.',
    contentHtml: `<p style="margin:0 0 18px">Hi ${escapeEmailHtml(firstName)},</p><p style="margin:0 0 18px">Stripe has confirmed payment and <strong>${escapeEmailHtml(organisationName)}</strong>'s <strong>${escapeEmailHtml(planName)}</strong> workspace is now active.</p>${emailButton({ href: signInUrl, label: 'Sign in to CivicPath' })}<p style="margin:0">Your billing records and invoice history are available from the subscription area of your CivicPath workspace.</p>`,
  });
  return { subject, text, html };
}

export function passwordResetMessage({ firstName, resetUrl }) {
  const subject = 'CivicPath - Reset your password';
  const text = `Hi ${firstName},\n\nA password reset was requested for your CivicPath account. Use this secure link within 60 minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this email. Your current password remains unchanged.\n\nRegards,\nCivicPath`;
  const html = brandedEmail({
    heading: 'Reset your password',
    preheader: 'Use the secure link within 60 minutes to reset your password.',
    contentHtml: `<p style="margin:0 0 18px">Hi ${escapeEmailHtml(firstName)},</p><p style="margin:0 0 18px">A password reset was requested for your CivicPath account. This link expires in 60 minutes.</p>${emailButton({ href: resetUrl, label: 'Reset password' })}<p style="margin:0">If you did not request this, you can ignore this email. Your current password remains unchanged.</p>`,
  });
  return { subject, text, html };
}

export function refundRequestedMessage({ firstName, amountLabel, organisationName }) {
  const subject = 'CivicPath - Refund request received';
  const text = `Hi ${firstName},\n\nA refund of ${amountLabel} for ${organisationName} has been requested through CivicPath. Stripe will return the amount to the original payment method. Processing time depends on the payment method and financial institution.\n\nRegards,\nCivicPath`;
  const html = brandedEmail({
    heading: 'Refund request received',
    preheader: 'Your CivicPath refund request has been received.',
    contentHtml: `<p style="margin:0 0 18px">Hi ${escapeEmailHtml(firstName)},</p><p style="margin:0">A refund of <strong>${escapeEmailHtml(amountLabel)}</strong> for <strong>${escapeEmailHtml(organisationName)}</strong> has been requested through CivicPath. Stripe will return the amount to the original payment method. Processing time depends on the payment method and financial institution.</p>`,
  });
  return { subject, text, html };
}

export function councilInvitationMessage({ firstName, organizationName, role, invitationUrl }) {
  const roleLabel = String(role || '').replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
  const subject = 'CivicPath - You have been invited to a Council workspace';
  const text = `Hi ${firstName},\n\nYou have been invited to join ${organizationName} in CivicPath as ${roleLabel}. Set your password using this one-time email link within 7 days:\n${invitationUrl}\n\nIf you were not expecting this invitation, you can ignore this email.\n\nRegards,\nCivicPath`;
  const html = brandedEmail({
    heading: 'You have been invited to CivicPath',
    preheader: 'Set your password to join your Council workspace.',
    contentHtml: `<p style="margin:0 0 18px">Hi ${escapeEmailHtml(firstName)},</p><p style="margin:0 0 18px">You have been invited to join <strong>${escapeEmailHtml(organizationName)}</strong> in CivicPath as <strong>${escapeEmailHtml(roleLabel)}</strong>.</p>${emailButton({ href: invitationUrl, label: 'Set password and join' })}<p style="margin:0">For your security, this one-time invitation link expires in 7 days. If you were not expecting this invitation, you can ignore this email.</p>`,
  });
  return { subject, text, html };
}

export async function sendTransactionalEmail({ to, message, organizationId = null, userId = null, category = 'transactional' }) {
  const config = await getPulseRoutingSettings({ includeSecrets: true });
  let outcome;
  if (!config.emailEnabled || !config.awsCredentialsConfigured || !config.fromEmail) outcome = { status: 'disabled' };
  else {
    try {
      const response = await emailClient(config).send(new SendEmailCommand({
        Source: sourceAddress(config),
        ReplyToAddresses: config.replyToEmail ? [config.replyToEmail] : undefined,
        Destination: { ToAddresses: [to] },
        Message: { Subject: { Charset: 'UTF-8', Data: message.subject }, Body: { Text: { Charset: 'UTF-8', Data: message.text }, Html: { Charset: 'UTF-8', Data: message.html } } },
      }));
      outcome = { status: 'sent', providerReference: response.MessageId || '' };
    } catch (error) {
      outcome = { status: 'failed', error: String(error.message || error).slice(0, 1000) };
    }
  }
  try {
    await NotificationDelivery.create({ organizationId, userId, category, recipientHash: hashToken(String(to).trim().toLowerCase()), subject: message.subject, status: outcome.status, providerReference: outcome.providerReference || null, error: outcome.error || null, retryGuidance: outcome.status === 'sent' ? 'Delivered to the configured provider. Delivery beyond the provider is not guaranteed.' : outcome.status === 'disabled' ? 'Configure SES routing before sending a fresh message.' : 'Generate a fresh message only after the delivery configuration or recipient issue is resolved.' });
  } catch (recordError) { console.error('[civicpath] notification delivery record failed', recordError); }
  return outcome;
}

export async function notifyBillingOperations(message) {
  return sendTransactionalEmail({ to: inboundMailbox(), message });
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSecureToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export { MAX_ATTEMPTS };
