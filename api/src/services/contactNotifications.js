import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { Op } from 'sequelize';
import { PublicContactEnquiry } from '../models/index.js';
import { brandedEmail, emailCallout, escapeEmailHtml } from './emailBranding.js';
import { getPulseRoutingSettings } from './pulseNotifications.js';

const contactMailbox = () => Buffer.from('aGVsbG9AYmlnbGl0dGxlYnVzaW5lc3MuY29t', 'base64').toString('utf8');
const MAX_ATTEMPTS = 3;

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
  const html = brandedEmail({
    heading: title,
    preheader: `A new CivicPath ${title.toLowerCase()} has been received.`,
    contentHtml: `<p style="margin:0 0 18px"><strong>Name:</strong> ${escapeEmailHtml(`${enquiry.firstName} ${enquiry.lastName}`)}<br><strong>Email:</strong> ${escapeEmailHtml(enquiry.email)}<br><strong>Council or organisation:</strong> ${escapeEmailHtml(enquiry.councilName || 'Not supplied')}<br><strong>Role:</strong> ${escapeEmailHtml(enquiry.role || 'Not supplied')}</p>${emailCallout({ title: 'Message', contentHtml: `<p style="margin:0">${escapeEmailHtml(enquiry.message).replace(/\n/g, '<br>')}</p>` })}`,
  });
  return { subject, text, html };
}

export function councilProofConfirmationMessage(enquiry) {
  const firstName = enquiry.firstName || 'there';
  const subject = 'CivicPath - Your Council Proof enquiry';
  const text = `Hi ${firstName},\n\nThank you for your interest in a CivicPath Council Proof. We have received your enquiry and will review the context you shared.\n\nYour $495 conversion credit\nA Council Proof is a focused 60-day engagement for one live portfolio. If your Council proceeds to its first annual CivicPath subscription within 30 days of the final Council Proof review, the full $495 paid Council Proof fee is applied as a credit against that annual subscription invoice.\n\nSubmitting this enquiry does not create an invoice, payment obligation or subscription. The Proof scope, timing and payment are agreed with your Council before the engagement begins.\n\nCivicPath does not promise funding outcomes. The Proof is designed to give your Council a clearer, decision-ready view of the selected portfolio.\n\nRegards,\nCivicPath`;
  const html = brandedEmail({
    heading: 'Your Council Proof enquiry is received',
    preheader: 'Your Council Proof enquiry is received and ready for review.',
    contentHtml: `<p style="margin:0 0 18px">Hi ${escapeEmailHtml(firstName)},</p><p style="margin:0 0 18px">Thank you for your interest in a CivicPath Council Proof. We will review the context you shared and come back with the most useful next practical step.</p>${emailCallout({ title: '$495 conversion credit', contentHtml: '<p style="margin:0"><strong>If your Council proceeds to its first annual CivicPath subscription within 30 days of the final Council Proof review, the full $495 paid Council Proof fee is applied as a credit against that annual subscription invoice.</strong></p>' })}<p style="margin:0 0 18px">A Council Proof is a focused 60-day engagement for one live portfolio. It is designed to help your Council test a practical workflow with real projects, constraints and a decision-ready review.</p><p style="margin:0;color:#5D6E6C;font-size:13px">Submitting this enquiry does not create an invoice, payment obligation or subscription. The Proof scope, timing and payment are agreed with your Council before the engagement begins.</p><p style="margin:22px 0 0;color:#5D6E6C;font-size:13px">CivicPath does not promise funding outcomes. The Proof is designed to give your Council a clearer view of the selected portfolio.</p>`,
  });
  return { subject, text, html };
}


export function publicEnquiryConfirmationMessage(enquiry) {
  const firstName = enquiry.firstName || 'there';
  const title = titleFor(enquiry.enquiryType, enquiry.category);
  const subject = `CivicPath - Your ${title.toLowerCase()}`;
  const text = `Hi ${firstName},\n\nThank you for contacting CivicPath. Your ${title.toLowerCase()} has been received and is now in the appropriate follow-up queue. We will respond through the details you provided.\n\nFor security, do not reply with passwords, access codes or payment details.\n\nRegards,\nCivicPath`;
  const html = brandedEmail({
    heading: 'Your enquiry is received',
    preheader: 'CivicPath has received your enquiry.',
    contentHtml: `<p style="margin:0 0 18px">Hi ${escapeEmailHtml(firstName)},</p><p style="margin:0 0 18px">Thank you for contacting CivicPath. Your <strong>${escapeEmailHtml(title.toLowerCase())}</strong> has been received and is now in the appropriate follow-up queue.</p>${emailCallout({ title: 'What happens next', contentHtml: '<p style="margin:0">We will respond through the details you provided. For security, do not send passwords, access codes or payment details.</p>' })}`,
  });
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

async function deliverPublicConfirmation(enquiry) {
  const config = await getPulseRoutingSettings({ includeSecrets: true });
  if (!config.emailEnabled || !config.awsCredentialsConfigured || !config.fromEmail) return { status: 'disabled' };
  try {
    const message = enquiry.enquiryType === 'council_proof' ? councilProofConfirmationMessage(enquiry) : publicEnquiryConfirmationMessage(enquiry);
    const providerReference = await sendEmail({ to: enquiry.email, message, config });
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

async function dispatchPublicConfirmation(enquiry) {
  if (enquiry.confirmationStatus !== 'pending') return enquiry;
  const delivery = await deliverPublicConfirmation(enquiry);
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
  await dispatchPublicConfirmation(enquiry);
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
