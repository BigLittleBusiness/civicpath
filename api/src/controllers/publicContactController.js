import Joi from 'joi';
import { sequelize } from '../config/database.js';
import { PublicContactEnquiry } from '../models/index.js';
import { consumeAltchaPayload, fingerprint, issueAltchaChallenge } from '../services/altchaProtection.js';
import { dispatchContactNotification } from '../services/contactNotifications.js';

const enquiryTypes = ['sales', 'council_proof', 'general'];
const contactSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(80).required(),
  lastName: Joi.string().trim().min(1).max(80).required(),
  email: Joi.string().trim().lowercase().email().max(191).required(),
  councilName: Joi.string().trim().max(180).allow('', null),
  role: Joi.string().trim().max(160).allow('', null),
  enquiryType: Joi.string().valid(...enquiryTypes).required(),
  message: Joi.string().trim().min(10).max(3_000).required(),
  privacyAcknowledged: Joi.boolean().valid(true).required(),
  sourceUrl: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(1_000).allow('', null),
  referrer: Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(1_000).allow('', null),
  altcha: Joi.string().trim().min(1).max(16_000).required(),
  honeypot: Joi.string().allow('').max(0).default(''),
});

export async function getPublicContactChallenge(req, res, next) {
  try {
    const purposeMap = { sales: 'sales_enquiry', council_proof: 'council_proof_enquiry', general: 'general_enquiry', pulse: 'portfolio_readiness_pulse' };
    const purpose = purposeMap[String(req.query.purpose || '')];
    if (!purpose) return res.status(422).json({ error: 'The requested contact form is not available.' });
    return res.json(await issueAltchaChallenge({ purpose, req }));
  } catch (error) { return next(error); }
}

export async function submitPublicContactEnquiry(req, res, next) {
  try {
    const { value, error } = contactSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(422).json({ error: 'Please review the highlighted contact fields.', details: error.details.map((item) => item.message) });
    if (value.honeypot) return res.status(422).json({ error: 'This enquiry could not be sent.' });
    const purposeMap = { sales: 'sales_enquiry', council_proof: 'council_proof_enquiry', general: 'general_enquiry' };
    const enquiry = await sequelize.transaction(async (transaction) => {
      await consumeAltchaPayload({ encodedPayload: value.altcha, purpose: purposeMap[value.enquiryType], transaction });
      return PublicContactEnquiry.create({
        firstName: value.firstName,
        lastName: value.lastName,
        email: value.email,
        councilName: value.councilName || null,
        role: value.role || null,
        enquiryType: value.enquiryType,
        message: value.message,
        privacyAcknowledgedAt: new Date(),
        sourceUrl: value.sourceUrl || null,
        referrer: value.referrer || null,
        ipHash: fingerprint(req, req.ip),
        userAgentHash: fingerprint(req, req.get('user-agent')),
      }, { transaction });
    });
    try { await dispatchContactNotification(enquiry); }
    catch (dispatchError) { console.error('[civicpath] public contact notification dispatch failed', dispatchError); }
    return res.status(201).json({ data: { received: true } });
  } catch (error) { return next(error); }
}
