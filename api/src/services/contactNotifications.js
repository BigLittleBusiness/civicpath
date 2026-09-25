import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Op } from 'sequelize';
import { PublicContactEnquiry } from '../models/index.js';
import { getPulseRoutingSettings } from './pulseNotifications.js';

const contactMailbox = () => Buffer.from('aGVsbG9AYmlnbGl0dGxlYnVzaW5lc3MuY29t', 'base64').toString('utf8');
const MAX_ATTEMPTS = 3;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
}

function titleFor(type, category) {
  const publicTitles = { sales: 'Sales enquiry', council_proof: 'Council Proof enquiry', general: 'General enquiry' };
  const supportTitles = {
    access: 'Access or account',
    billing: 'Billing',
    data: 'Data or import',
    grant_lifecycle: 'Grant lifecycle',
    portfolio: 'Portfolio or project workflow',
    technical: 'Technical issue',
    other: 'Another support matter',
  };
  if (type === 'support') return `Support enquiry - ${supportTitles[category] || 'General support'}`;
  return publicTitles[type] || 'General enquiry';
}

function sourceAddress(config) {
  return config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail;
}

function emailClient(config) {
  return new SESClient({ region: config.awsRegion, credentials: { accessKeyId: config.awsAccessKeyId, secretAccessKey: config.awsSecretAccessKey } });
}

function nextAttempt(attemptCount) {
  return new Date(Date.now() + 15 * (attemptCount + 1) * 60 * 1000);
}

export function contactEmailMessage(enquiry) {
  const title = titleFor(enquiry.enquiryType, enquiry.category);
  const subject = `CivicPath - ${title}`;
  const text = `A CivicPath ${title.toLowerCase()} has been received.\n\nName: ${enquiry.firstName} ${enquiry.lastName}\nEmail: ${enquiry.email}\nCouncil or organisation: ${enquiry.councilName || 'Not supplied'}\nRole: ${enquiry.role || 'Not supplied'}\n\nMessage:\n${enquiry.message}\n\nRecorded: ${enquiry.createdAt?.toISOString?.() || new Date().toISOString()}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#1c2925;line-height:1.55"><p style="color:#173f36;font-weight:700">CivicPath - ${escapeHtml(title)}</p><p><strong>Name:</strong> ${escapeHtml(`${enquiry.firstName} ${enquiry.lastName}`)}<br/><strong>Email:</strong> ${escapeHtml(enquiry.email)}<br/><strong>Council or organisation:</strong> ${escapeHtml(enquiry.councilName || 'Not supplied')}<br/><strong>Role:</strong> ${escapeHtml(enquiry.role || 'Not supplied')}</p><p><strong>Message</strong><br/>${escapeHtml(enquiry.message).replace(/\n/g, '<br/>')}</p></div>`;
  return { subject, text, html };
}

export function councilProofConfirmationMessage(enquiry) {
  const name = escapeHtml(enquiry.firstName || 'there');
  const subject = 'CivicPath - Your Council Proof enquiry';
  const text = `Hi ${enquiry.firstName || 'there'},\n\nThank you for your interest in a CivicPath Council Proof. We have received your enquiry and will review the context you shared.\n\nYour $495 conversion credit\nA Council Proof is a focused 60-day engagement for one live portfolio. If your Council proceeds to its first annual CivicPath subscription within 30 days of the final Council Proof review, the full $495 paid Council Proof fee is applied as a credit against that annual subscription invoice.\n\nSubmitting this enquiry does not create an invoice, payment obligation or subscription. The Proof scope, timing and payment are agreed with your Council before the engagement begins.\n\nCivicPath does not promise funding outcomes. The Proof is designed to give your Council a clearer, decision-ready view of the selected portfolio.\n\nRegards,\nCivicPath`;
  const html = `<!doctype html><html lang="en"><body style="margin:0;padding:0;background:#f4f0e8;color:#1c2925;font-family:Arial,Helvetica,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background:#fff;border-radius:16px;overflow:hidden"><tr><td style="padding:28px 32px 18px;background:#173f36;color:#fff"><p style="margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#b9d5c4">CivicPath</p><h1 style="margin:0;font-size:28px;line-height:1.2">Your Council Proof enquiry is received</h1></td></tr><tr><td style="padding:30px 32px;font-size:16px;line-height:1.55"><p style="margin:0 0 18px">Hi ${name},</p><p style="margin:0 0 22px">Thank you for your interest in a CivicPath Council Proof. We will review the context you shared and come back with the most useful next practical step.</p><div style="margin:0 0 24px;padding:18px 20px;border-left:4px solid #1d8063;background:#edf7f0"><p style="margin:0 0 7px;color:#17654f;font-size:12px;font-weight:700;letter-spacing:.07em;text-transform:uppercase">$495 conversion credit</p><p style="margin:0;color:#204239"><strong>If your Council proceeds to its first annual CivicPath subscription within 30 days of the final Council Proof review, the full $495 paid Council Proof fee is applied as a credit against that annual subscription invoice.</strong></p></div><p style="margin:0 0 18px">A Council Proof is a focused 60-day engagement for one live portfolio. It is designed to help your Council test a practical workflow with real projects, constraints and a decision-ready review.</p><p style="margin:0;color:#63736c;font-size:13px">Submitting this enquiry does not create an invoice, payment obligation or subscription. The Proof scope, timing and payment are agreed with your Council before the engagement begins.</p><p style="margin:22px 0 0;color:#63736c;font-size:13px">CivicPath does not promise funding outcomes. The Proof is designed to give your Council a clearer view of the selected portfolio.</p></td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}

async function sendEmail({ to, message, config }) {
  const response = await emailClient(config).send(new SendEmailCommand({
    Source: sourceAddress(config),
    ReplyToAddresses: config.replyToEmail ? [config.replyToEmail] : undefined,
    Destination: { ToAddresses: [to] },
    Message: { Subject: { Charset: 'UTF-8', Data: message.subject }, Body: { Text: { Charset: 'UTF-8', Data: message.text }, Html: { Charset: 'UTF-8', Data: message.html } } },
  }));
  return response.MessageId || '';
}

export async function deliverContactEmail(message) {
  const config = await getPulseRoutingSettings({ includeSecrets: true });
  if (!config.emailEnabled || !config.awsCredentialsConfigured || !config.fromEmail) return { status: 'disabled' };
  try {
    const providerReference = await sendEmail({ to: contactMailbox(), message, config });
    return { status: 'sent', providerReference };
  } catch (error) {
    return { status: 'failed', error: String(error.message || error).slice(0, 1000) };
  }
}

async function deliverCouncilProofConfirmation(enquiry) {
  const config = await getPulseRoutingSettings({ includeSecrets: true });
  if (!config.emailEnabled || !config.awsCredentialsConfigured || !config.fromEmail) return { status: 'disabled' };
  try {
    const providerReference = await sendEmail({ to: enquiry.email, message: councilProofConfirmationMessage(enquiry), config });
    return { status: 'sent', providerReference };
  } catch (error) {
    return { status: 'failed', error: String(error.message || error).slice(0, 1000) };
  }
}

async function dispatchInternalContactNotification(enquiry) {
  if (enquiry.notificationStatus !== 'pending') return enquiry;
  const delivery = await deliverContactEmail(contactEmailMessage(enquiry));
  if (delivery.status === 'disabled') {
    await enquiry.update({ notificationStatus: 'disabled', notificationError: 'Transactional email is not configured.' });
  } else if (delivery.status === 'sent') {
    await enquiry.update({ notificationStatus: 'sent', notificationAttempts: enquiry.notificationAttempts + 1, notificationLastAttemptAt: new Date(), notificationDeliveredAt: new Date(), notificationNextAttemptAt: null, notificationError: null, notificationProviderReference: delivery.providerReference });
  } else {
    const attempts = enquiry.notificationAttempts + 1;
    await enquiry.update({ notificationStatus: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', notificationAttempts: attempts, notificationLastAttemptAt: new Date(), notificationNextAttemptAt: attempts >= MAX_ATTEMPTS ? null : nextAttempt(enquiry.notificationAttempts), notificationError: delivery.error });
  }
  return enquiry;
}

async function dispatchCouncilProofConfirmation(enquiry) {
  if (enquiry.enquiryType !== 'council_proof' || enquiry.confirmationStatus !== 'pending') return enquiry;
  const delivery = await deliverCouncilProofConfirmation(enquiry);
  if (delivery.status === 'disabled') {
    await enquiry.update({ confirmationStatus: 'disabled', confirmationError: 'Transactional email is not configured.' });
  } else if (delivery.status === 'sent') {
    await enquiry.update({ confirmationStatus: 'sent', confirmationAttempts: enquiry.confirmationAttempts + 1, confirmationLastAttemptAt: new Date(), confirmationDeliveredAt: new Date(), confirmationNextAttemptAt: null, confirmationError: null, confirmationProviderReference: delivery.providerReference });
  } else {
    const attempts = enquiry.confirmationAttempts + 1;
    await enquiry.update({ confirmationStatus: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', confirmationAttempts: attempts, confirmationLastAttemptAt: new Date(), confirmationNextAttemptAt: attempts >= MAX_ATTEMPTS ? null : nextAttempt(enquiry.confirmationAttempts), confirmationError: delivery.error });
  }
  return enquiry;
}

export async function dispatchContactNotification(enquiry) {
  await dispatchInternalContactNotification(enquiry);
  await dispatchCouncilProofConfirmation(enquiry);
  return enquiry;
}

export async function retryPendingContactNotifications() {
  const dueAt = new Date();
  const enquiries = await PublicContactEnquiry.findAll({
    where: {
      [Op.or]: [
        { notificationStatus: 'pending', notificationNextAttemptAt: { [Op.lte]: dueAt } },
        { confirmationStatus: 'pending', confirmationNextAttemptAt: { [Op.lte]: dueAt } },
      ],
    },
    order: [['createdAt', 'ASC']],
    limit: 50,
  });
  for (const enquiry of enquiries) await dispatchContactNotification(enquiry);
  return { attempted: enquiries.length };
}
