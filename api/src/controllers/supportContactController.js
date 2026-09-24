import Joi from 'joi';
import { sequelize } from '../config/database.js';
import { AuditLog, Organization, SupportCase, User } from '../models/index.js';
import { consumeAltchaPayload, issueAltchaChallenge } from '../services/altchaProtection.js';
import { contactEmailMessage, deliverContactEmail } from '../services/contactNotifications.js';

const supportSchema = Joi.object({
  category: Joi.string().valid('access', 'billing', 'data', 'grant_lifecycle', 'portfolio', 'technical', 'other').required(),
  subject: Joi.string().trim().min(3).max(240).required(),
  message: Joi.string().trim().min(10).max(3_000).required(),
  altcha: Joi.string().trim().min(1).max(16_000).required(),
  honeypot: Joi.string().allow('').max(0).default(''),
});

export async function getSupportContactChallenge(req, res, next) {
  try {
    return res.json(await issueAltchaChallenge({ purpose: 'support_enquiry', req }));
  } catch (error) { return next(error); }
}

export async function submitSupportContact(req, res, next) {
  try {
    const { value, error } = supportSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(422).json({ error: 'Please review the highlighted support fields.', details: error.details.map((item) => item.message) });
    if (value.honeypot) return res.status(422).json({ error: 'This support enquiry could not be sent.' });
    const { caseRecord, user, organization } = await sequelize.transaction(async (transaction) => {
      await consumeAltchaPayload({ encodedPayload: value.altcha, purpose: 'support_enquiry', transaction });
      const [requestUser, organisation] = await Promise.all([User.findByPk(req.auth.sub, { transaction }), Organization.findByPk(req.tenant.organizationId, { transaction })]);
      if (!requestUser || !organisation) throw new Error('The signed-in support context is unavailable.');
      const created = await SupportCase.create({ organizationId: organisation.id, requesterId: requestUser.id, title: value.subject, category: value.category, priority: 'normal', summary: value.message }, { transaction });
      await AuditLog.create({ organizationId: organisation.id, userId: requestUser.id, entityType: 'support_case', entityId: created.id, action: 'support_enquiry_created', metadata: { category: value.category }, ipAddress: req.ip }, { transaction });
      return { caseRecord: created, user: requestUser, organization: organisation };
    });
    const message = contactEmailMessage({ ...caseRecord.toJSON(), enquiryType: 'support', firstName: user.firstName, lastName: user.lastName, email: user.email, councilName: organization.name, role: user.role, message: `${caseRecord.title}\n\n${caseRecord.summary}` });
    try {
      const delivery = await deliverContactEmail(message);
      await AuditLog.create({ organizationId: organization.id, userId: user.id, entityType: 'support_case', entityId: caseRecord.id, action: 'support_enquiry_delivery_attempted', metadata: { status: delivery.status }, ipAddress: req.ip });
    } catch (dispatchError) { console.error('[civicpath] support enquiry notification dispatch failed', dispatchError); }
    return res.status(201).json({ data: { id: caseRecord.id, message: message.subject } });
  } catch (error) { return next(error); }
}
