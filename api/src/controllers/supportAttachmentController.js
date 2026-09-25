import crypto from 'node:crypto';
import multer from 'multer';
import { AuditLog, Organization, SupportAttachment, SupportCase, User } from '../models/index.js';
import { consumeAltchaPayload } from '../services/altchaProtection.js';
import { contactEmailMessage, deliverContactEmail } from '../services/contactNotifications.js';
import { readSupportAttachment, removeSupportAttachment, storeSupportAttachment, SupportAttachmentError, supportAttachmentLimits, validateSupportAttachments } from '../services/supportAttachmentStorage.js';
import Joi from 'joi';
import { sequelize } from '../config/database.js';

const supportSchema = Joi.object({
  category: Joi.string().valid('access', 'billing', 'data', 'grant_lifecycle', 'portfolio', 'technical', 'other').required(),
  subject: Joi.string().trim().min(3).max(240).required(),
  message: Joi.string().trim().min(10).max(3_000).required(),
  altcha: Joi.string().trim().min(1).max(16_000).required(),
  honeypot: Joi.string().allow('').max(0).default(''),
});

export const uploadSupportAttachments = multer({
  storage: multer.memoryStorage(),
  limits: { files: supportAttachmentLimits.maxFiles, fileSize: supportAttachmentLimits.maxFileBytes, fieldSize: 20_000, fields: 12 },
}).array('attachments', supportAttachmentLimits.maxFiles);

function attachmentMetadata(attachment) {
  return { id: attachment.id, originalFilename: attachment.originalFilename, contentType: attachment.contentType, sizeBytes: Number(attachment.sizeBytes), createdAt: attachment.createdAt };
}

export async function submitSupportContactWithAttachments(req, res, next) {
  const storedAttachments = [];
  try {
    const { value, error } = supportSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(422).json({ error: 'Please review the highlighted support fields.', details: error.details.map((item) => item.message) });
    if (value.honeypot) return res.status(422).json({ error: 'This support enquiry could not be sent.' });
    validateSupportAttachments(req.files || []);

    const result = await sequelize.transaction(async (transaction) => {
      await consumeAltchaPayload({ encodedPayload: value.altcha, purpose: 'support_enquiry', transaction });
      const [user, organization] = await Promise.all([User.findByPk(req.auth.sub, { transaction }), Organization.findByPk(req.tenant.organizationId, { transaction })]);
      if (!user || !organization) throw new Error('The signed-in support context is unavailable.');
      const caseRecord = await SupportCase.create({ organizationId: organization.id, requesterId: user.id, title: value.subject, category: value.category, priority: 'normal', summary: value.message }, { transaction });
      const attachments = [];
      for (const file of req.files || []) {
        const attachmentId = crypto.randomUUID();
        const stored = await storeSupportAttachment({ attachmentId, organizationId: organization.id, supportCaseId: caseRecord.id, file });
        storedAttachments.push(stored);
        attachments.push(await SupportAttachment.create({ id: attachmentId, supportCaseId: caseRecord.id, organizationId: organization.id, uploadedBy: user.id, ...stored }, { transaction }));
      }
      await AuditLog.create({ organizationId: organization.id, userId: user.id, entityType: 'support_case', entityId: caseRecord.id, action: 'support_enquiry_created', metadata: { category: value.category, attachmentCount: attachments.length }, ipAddress: req.ip }, { transaction });
      return { caseRecord, user, organization, attachments };
    });

    const attachmentNote = result.attachments.length ? `\n\n${result.attachments.length} private attachment${result.attachments.length === 1 ? '' : 's'} recorded in the CivicPath Support desk.` : '';
    const message = contactEmailMessage({ ...result.caseRecord.toJSON(), enquiryType: 'support', firstName: result.user.firstName, lastName: result.user.lastName, email: result.user.email, councilName: result.organization.name, role: result.user.role, message: `${result.caseRecord.title}\n\n${result.caseRecord.summary}${attachmentNote}` });
    try {
      const delivery = await deliverContactEmail(message);
      await AuditLog.create({ organizationId: result.organization.id, userId: result.user.id, entityType: 'support_case', entityId: result.caseRecord.id, action: 'support_enquiry_delivery_attempted', metadata: { status: delivery.status }, ipAddress: req.ip });
    } catch (dispatchError) { console.error('[civicpath] support enquiry notification dispatch failed', dispatchError); }
    return res.status(201).json({ data: { id: result.caseRecord.id, message: message.subject, attachments: result.attachments.map(attachmentMetadata) } });
  } catch (error) {
    await Promise.all(storedAttachments.map((stored) => removeSupportAttachment(stored))).catch(() => null);
    return next(error);
  }
}

export async function downloadSupportAttachment(req, res, next) {
  try {
    const supportCase = await SupportCase.findByPk(req.params.caseId);
    if (!supportCase) return res.status(404).json({ error: 'Support case not found.' });
    const attachment = await SupportAttachment.findOne({ where: { id: req.params.attachmentId, supportCaseId: supportCase.id } });
    if (!attachment) return res.status(404).json({ error: 'Support attachment not found.' });
    const body = await readSupportAttachment(attachment);
    await AuditLog.create({ organizationId: req.auth.organizationId, userId: req.auth.sub, entityType: 'support_attachment', entityId: attachment.id, action: 'support_attachment_downloaded', metadata: { supportCaseId: supportCase.id, contentType: attachment.contentType, sizeBytes: Number(attachment.sizeBytes) }, ipAddress: req.ip });
    res.setHeader('Content-Type', attachment.contentType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${attachment.originalFilename.replace(/["\\\r\n]/g, '')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (Buffer.isBuffer(body)) return res.status(200).send(body);
    body.on('error', next);
    return body.pipe(res);
  } catch (error) { return next(error); }
}

export { SupportAttachmentError };
