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

async function sendEmail({ message, config }) {
  const response = await emailClient(config).send(new SendEmailCommand({
    Source: sourceAddress(config),
    ReplyToAddresses: config.replyToEmail ? [config.replyToEmail] : undefined,
    Destination: { ToAddresses: [contactMailbox()] },
    Message: { Subject: { Charset: 'UTF-8', Data: message.subject }, Body: { Text: { Charset: 'UTF-8', Data: message.text }, Html: { Charset: 'UTF-8', Data: message.html } } },
  }));
  return response.MessageId || '';
}

export async function deliverContactEmail(message) {
  const config = await getPulseRoutingSettings({ includeSecrets: true });
  if (!config.emailEnabled || !config.awsCredentialsConfigured || !config.fromEmail) return { status: 'disabled' };
  try {
    const providerReference = await sendEmail({ message, config });
    return { status: 'sent', providerReference };
  } catch (error) {
    return { status: 'failed', error: String(error.message || error).slice(0, 1000) };
  }
}

export async function dispatchContactNotification(enquiry) {
  const delivery = await deliverContactEmail(contactEmailMessage(enquiry));
  if (delivery.status === 'disabled') {
    await enquiry.update({ notificationStatus: 'disabled', notificationError: 'Transactional email is not configured.' });
  } else if (delivery.status === 'sent') {
    const providerReference = delivery.providerReference;
    await enquiry.update({ notificationStatus: 'sent', notificationAttempts: enquiry.notificationAttempts + 1, notificationLastAttemptAt: new Date(), notificationDeliveredAt: new Date(), notificationNextAttemptAt: null, notificationError: null, notificationProviderReference: providerReference });
  } else {
    const attempts = enquiry.notificationAttempts + 1;
    await enquiry.update({ notificationStatus: attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', notificationAttempts: attempts, notificationLastAttemptAt: new Date(), notificationNextAttemptAt: attempts >= MAX_ATTEMPTS ? null : nextAttempt(enquiry.notificationAttempts), notificationError: delivery.error });
  }
  return enquiry;
}

export async function retryPendingContactNotifications() {
  const enquiries = await PublicContactEnquiry.findAll({ where: { notificationStatus: 'pending', notificationNextAttemptAt: { [Op.lte]: new Date() } }, order: [['notificationNextAttemptAt', 'ASC']], limit: 50 });
  for (const enquiry of enquiries) await dispatchContactNotification(enquiry);
  return { attempted: enquiries.length };
}
