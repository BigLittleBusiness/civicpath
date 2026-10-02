import crypto from 'node:crypto';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { getPulseRoutingSettings } from './pulseNotifications.js';

const MAX_ATTEMPTS = 3;
const inboundMailbox = () => Buffer.from('aGVsbG9AYmlnbGl0dGxlYnVzaW5lc3MuY29t', 'base64').toString('utf8');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function sourceAddress(config) {
  return config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;
}

function emailClient(config) {
  return new SESClient({ region: config.awsRegion, credentials: { accessKeyId: config.awsAccessKeyId, secretAccessKey: config.awsSecretAccessKey } });
}

export function registrationReceiptMessage({ firstName, organisationName, planName, checkoutUrl }) {
  const subject = 'CivicPath - Complete your secure subscription checkout';
  const text = `Hi ${firstName},\n\nYour CivicPath registration for ${organisationName} has been received. Complete the secure Stripe checkout for ${planName} to activate your Council workspace:\n${checkoutUrl}\n\nCivicPath access is activated only after Stripe confirms payment. This checkout link is time-limited. If it expires, use the CivicPath contact form and select Billing.\n\nRegards,\nCivicPath`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c2925;line-height:1.55"><h1 style="color:#173f36">Your CivicPath registration is ready</h1><p>Hi ${escapeHtml(firstName)},</p><p>Your registration for <strong>${escapeHtml(organisationName)}</strong> has been received. Complete the secure Stripe checkout for <strong>${escapeHtml(planName)}</strong> to activate your Council workspace.</p><p><a href="${escapeHtml(checkoutUrl)}" style="display:inline-block;background:#17654f;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Continue to secure checkout</a></p><p>CivicPath access is activated only after Stripe confirms payment. This checkout link is time-limited. If it expires, use the CivicPath contact form and select Billing.</p><p>Regards,<br/>CivicPath</p></div>`;
  return { subject, text, html };
}

export function accountActivatedMessage({ firstName, organisationName, planName, signInUrl }) {
  const subject = 'CivicPath - Your Council workspace is active';
  const text = `Hi ${firstName},\n\nStripe has confirmed payment and ${organisationName}'s ${planName} workspace is now active.\n\nSign in: ${signInUrl}\n\nYour billing records and invoice history are available from the subscription area of your CivicPath workspace.\n\nRegards,\nCivicPath`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c2925;line-height:1.55"><h1 style="color:#173f36">Your Council workspace is active</h1><p>Hi ${escapeHtml(firstName)},</p><p>Stripe has confirmed payment and <strong>${escapeHtml(organisationName)}</strong>'s <strong>${escapeHtml(planName)}</strong> workspace is now active.</p><p><a href="${escapeHtml(signInUrl)}" style="display:inline-block;background:#17654f;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Sign in to CivicPath</a></p><p>Your billing records and invoice history are available from the subscription area of your CivicPath workspace.</p><p>Regards,<br/>CivicPath</p></div>`;
  return { subject, text, html };
}

export function passwordResetMessage({ firstName, resetUrl }) {
  const subject = 'CivicPath - Reset your password';
  const text = `Hi ${firstName},\n\nA password reset was requested for your CivicPath account. Use this secure link within 60 minutes:\n${resetUrl}\n\nIf you did not request this, you can ignore this email. Your current password remains unchanged.\n\nRegards,\nCivicPath`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c2925;line-height:1.55"><h1 style="color:#173f36">Reset your password</h1><p>Hi ${escapeHtml(firstName)},</p><p>A password reset was requested for your CivicPath account. This link expires in 60 minutes.</p><p><a href="${escapeHtml(resetUrl)}" style="display:inline-block;background:#17654f;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:700">Reset password</a></p><p>If you did not request this, you can ignore this email. Your current password remains unchanged.</p><p>Regards,<br/>CivicPath</p></div>`;
  return { subject, text, html };
}

export function refundRequestedMessage({ firstName, amountLabel, organisationName }) {
  const subject = 'CivicPath - Refund request received';
  const text = `Hi ${firstName},\n\nA refund of ${amountLabel} for ${organisationName} has been requested through CivicPath. Stripe will return the amount to the original payment method. Processing time depends on the payment method and financial institution.\n\nRegards,\nCivicPath`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c2925;line-height:1.55"><h1 style="color:#173f36">Refund request received</h1><p>Hi ${escapeHtml(firstName)},</p><p>A refund of <strong>${escapeHtml(amountLabel)}</strong> for <strong>${escapeHtml(organisationName)}</strong> has been requested through CivicPath. Stripe will return the amount to the original payment method. Processing time depends on the payment method and financial institution.</p><p>Regards,<br/>CivicPath</p></div>`;
  return { subject, text, html };
}

export async function sendTransactionalEmail({ to, message }) {
  const config = await getPulseRoutingSettings({ includeSecrets: true });
  if (!config.emailEnabled || !config.awsCredentialsConfigured || !config.fromEmail) return { status: 'disabled' };
  try {
    const response = await emailClient(config).send(new SendEmailCommand({
      Source: sourceAddress(config),
      ReplyToAddresses: config.replyToEmail ? [config.replyToEmail] : undefined,
      Destination: { ToAddresses: [to] },
      Message: { Subject: { Charset: 'UTF-8', Data: message.subject }, Body: { Text: { Charset: 'UTF-8', Data: message.text }, Html: { Charset: 'UTF-8', Data: message.html } } },
    }));
    return { status: 'sent', providerReference: response.MessageId || '' };
  } catch (error) {
    return { status: 'failed', error: String(error.message || error).slice(0, 1000) };
  }
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
