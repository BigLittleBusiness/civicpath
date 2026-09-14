import Joi from 'joi';
import { Grant } from '../models/index.js';
import { recordAudit } from '../services/audit.js';

const grantSchema = Joi.object({
  title: Joi.string().max(200).required(), funder: Joi.string().max(180).required(), projectId: Joi.string().uuid().allow(null), fundingPathwayId: Joi.string().uuid().allow(null), leadId: Joi.string().uuid().allow(null),
  requestedAmount: Joi.number().min(0).allow(null), awardedAmount: Joi.number().min(0).allow(null), status: Joi.string().valid('identified', 'assessing', 'preparing', 'submitted', 'awarded', 'contracted', 'acquitting', 'acquitted', 'not_successful', 'withdrawn'), dueDate: Joi.date().iso().allow(null), acquittalDueDate: Joi.date().iso().allow(null), notes: Joi.string().allow('', null),
});

export async function listGrants(req, res, next) {
  try { return res.json({ data: await Grant.findAll({ where: req.tenant, order: [['dueDate', 'ASC']] }) }); } catch (error) { return next(error); }
}

export async function createGrant(req, res, next) {
  try {
    const { value, error } = grantSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const grant = await Grant.create({ ...value, organizationId: req.tenant.organizationId });
    await recordAudit(req, { entityType: 'grant', entityId: grant.id, action: 'created', metadata: { title: grant.title } });
    return res.status(201).json({ data: grant });
  } catch (error) { return next(error); }
}

