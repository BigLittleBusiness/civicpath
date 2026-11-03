import crypto from 'node:crypto';
import { notificationError, recipientHash, eventHash } from './notificationPolicy.js';

const MAX_BODY_BYTES = 65536;
const MAX_AGE_MS = 86400000;
export function snsSigningString(envelope) {
  const fields = ['Message', 'MessageId', ...(envelope.Subject !== undefined ? ['Subject'] : []), 'Timestamp', 'TopicArn', 'Type'];
  return fields.map((field) => `${field}\n${envelope[field]}\n`).join('');
}
// No network requests. Pins are operator-provided public SNS certificates/keys from an independently
// authenticated deployment channel. An empty map is the default and deliberately disables ingress.
export function createPinnedSnsVerifier({ pins = {}, now = () => new Date() } = {}) {
  const entries = Object.entries(pins);
  return {
    enabled: entries.length > 0,
    verify(rawBody) {
      if (!entries.length) throw notificationError('Provider feedback integration is disabled.', 503);
      if (!Buffer.isBuffer(rawBody) || !rawBody.length || rawBody.length > MAX_BODY_BYTES) throw notificationError('Invalid feedback payload.', 400);
      let envelope;
      try { envelope = JSON.parse(rawBody.toString('utf8')); } catch { throw notificationError('Invalid feedback payload.', 400); }
      if (!envelope || envelope.Type !== 'Notification' || envelope.SignatureVersion !== '2') throw notificationError('Unsigned or unsupported provider feedback.', 403);
      if (!['Message', 'MessageId', 'Timestamp', 'TopicArn', 'Signature', 'SigningCertURL'].every((key) => typeof envelope[key] === 'string') || (envelope.Subject !== undefined && typeof envelope.Subject !== 'string')) throw notificationError('Invalid feedback envelope.', 400);
      const pin = pins[envelope.TopicArn];
      const timestamp = Date.parse(envelope.Timestamp); const instant = now().getTime();
      if (!pin || !/^arn:aws:sns:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]+$/.test(envelope.TopicArn) || !Number.isFinite(timestamp) || timestamp > instant + 300000 || timestamp < instant - MAX_AGE_MS) throw notificationError('Untrusted or expired provider feedback.', 403);
      let url;
      try { url = new URL(envelope.SigningCertURL); } catch { throw notificationError('Untrusted feedback certificate.', 403); }
      const region = envelope.TopicArn.split(':')[3];
      if (url.protocol !== 'https:' || url.hostname !== `sns.${region}.amazonaws.com` || url.username || url.password || url.port || url.search || url.hash || !/^\/SimpleNotificationService-[A-Za-z0-9]+\.pem$/.test(url.pathname) || pin.signingCertUrl !== envelope.SigningCertURL) throw notificationError('Untrusted feedback certificate.', 403);
      const validFrom = Date.parse(pin.validFrom); const validUntil = Date.parse(pin.validUntil);
      if (!Number.isFinite(validFrom) || !Number.isFinite(validUntil) || instant < validFrom || instant >= validUntil || timestamp < validFrom || timestamp >= validUntil) throw notificationError('Expired feedback trust pin.', 403);
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.Signature) || envelope.Signature.length > 1024) throw notificationError('Invalid provider signature.', 403);
      try {
        const publicKey = crypto.createPublicKey(pin.publicKeyPem);
        if (publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails.modulusLength < 2048 || !crypto.verify('RSA-SHA256', Buffer.from(snsSigningString(envelope)), publicKey, Buffer.from(envelope.Signature, 'base64'))) throw new Error('Signature rejected');
      } catch { throw notificationError('Invalid provider signature.', 403); }
      let event;
      try { event = JSON.parse(envelope.Message); } catch { throw notificationError('Invalid SES feedback event.', 400); }
      const type = event.notificationType || event.eventType;
      const outcome = { Delivery: 'delivered', Bounce: 'bounced', Complaint: 'complained', Reject: 'failed' }[type];
      if (!outcome || typeof event.mail?.messageId !== 'string' || !event.mail.messageId || event.mail.messageId.length > 255) throw notificationError('Unsupported SES feedback outcome.', 400);
      const recipients = type === 'Bounce' ? event.bounce?.bouncedRecipients?.map((item) => item.emailAddress) : type === 'Complaint' ? event.complaint?.complainedRecipients?.map((item) => item.emailAddress) : type === 'Delivery' ? event.delivery?.recipients : event.mail.destination;
      if (!Array.isArray(recipients) || recipients.length < 1 || recipients.length > 50 || !recipients.every((email) => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) throw notificationError('Invalid feedback recipients.', 400);
      // Keep only operational metadata: never persist raw SNS/SES content, recipients or diagnostics.
      return { eventHash: eventHash(`${envelope.TopicArn}:${envelope.MessageId}`), providerReference: event.mail.messageId, outcome, recipientHashes: [...new Set(recipients.map(recipientHash))], occurredAt: new Date(timestamp) };
    },
  };
}
export { MAX_BODY_BYTES as MAX_FEEDBACK_BODY_BYTES };
