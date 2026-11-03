import { sequelize } from '../config/database.js';
import { assertCreateActor, validateCreateReferences, handleIntegrationError, withActiveRecords, completeActiveRegister } from '../backendRuntime.js';
import { createPathway as secureCreatePathway, listPathways as secureListPathways } from './fundingLifecycleController.js';
import { safeEvidenceUrl } from '../services/recordMaintenance.js';
import Joi from 'joi';
import { Priority, WorkItem, EvidenceItem, ReadinessAssessment } from '../models/index.js';
import { recordAudit } from '../services/audit.js';
import { calculateReadinessScore } from '../utils/readiness.js';

const prioritySchema = Joi.object({ title: Joi.string().max(200).required(), planReference: Joi.string().max(160).allow('', null), outcomeArea: Joi.string().max(100).allow('', null) });
const workItemSchema = Joi.object({ projectId: Joi.string().uuid().allow(null), grantId: Joi.string().uuid().allow(null), ownerId: Joi.string().uuid().allow(null), title: Joi.string().max(240).required(), workType: Joi.string().valid('action', 'grant_task', 'decision', 'risk').default('action'), status: Joi.string().valid('not_started', 'in_progress', 'blocked', 'complete').default('not_started'), priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'), dueDate: Joi.date().iso().allow(null), detail: Joi.string().allow('', null), impact: Joi.number().integer().min(1).max(5).allow(null), likelihood: Joi.number().integer().min(1).max(5).allow(null) });
const readinessSchema = Joi.object({ scopeScore: Joi.number().integer().min(0).max(5).required(), costScore: Joi.number().integer().min(0).max(5).required(), approvalsScore: Joi.number().integer().min(0).max(5).required(), partnerScore: Joi.number().integer().min(0).max(5).required(), fundingScore: Joi.number().integer().min(0).max(5).required(), deliveryScore: Joi.number().integer().min(0).max(5).required(), assessmentNote: Joi.string().min(10).max(8000).required() });
const evidenceSchema = Joi.object({ projectId: Joi.string().uuid().allow(null), grantId: Joi.string().uuid().allow(null), title: Joi.string().max(240).required(), evidenceType: Joi.string().valid('document', 'metric', 'decision_record', 'link', 'other').default('document'), externalUrl: Joi.string().uri().allow('', null), source: Joi.string().max(240).allow('', null), isVerified: Joi.boolean().default(false) });

async function validated(schema, input, res) {
  const { value, error } = schema.validate(input, { allowUnknown: false });
  if (error) { res.status(422).json({ error: error.message }); return null; }
  return value;
}

export async function listPriorities(req, res, next) { try { return res.json({ data: await Priority.findAll({ where: { ...req.tenant, status: 'active' }, order: [['title', 'ASC']] }) }); } catch (error) { return next(error); } }
export async function createPriority(req, res, next) {
  try {
    const value = await validated(prioritySchema, req.body, res); if (!value) return;
    const record = await sequelize.transaction(async (transaction) => {
      await assertCreateActor(req, transaction, ['org_admin', 'portfolio_manager']);
      const record = await Priority.create({ ...value, organizationId: req.tenant.organizationId }, { transaction });
      await recordAudit(req, { entityType: 'priority', entityId: record.id, action: 'created', transaction });
      return record;
    });
    return res.status(201).json({ data: record });
  } catch (error) { return handleIntegrationError(error, res, next); }
}
// Direct imports cannot reach the historic lifecycle bypass either.
export const listPathways = secureListPathways;
export const createPathway = secureCreatePathway;
export async function listWorkItems(req, res, next) {
  try { return res.json({ data: await completeActiveRegister(WorkItem, { where: req.tenant, order: [['dueDate', 'ASC']] }) }); }
  catch (error) { return handleIntegrationError(error, res, next); }
}
export async function createWorkItem(req, res, next) {
  try {
    const value = await validated(workItemSchema, req.body, res); if (!value) return;
    const record = await sequelize.transaction(async (transaction) => {
      await assertCreateActor(req, transaction);
      await validateCreateReferences(req, value, transaction);
      const record = await WorkItem.create({ ...value, organizationId: req.tenant.organizationId }, { transaction });
      await recordAudit(req, { entityType: 'work_item', entityId: record.id, action: 'created', metadata: { workType: record.workType }, transaction });
      return record;
    });
    return res.status(201).json({ data: record });
  } catch (error) { return handleIntegrationError(error, res, next); }
}
export async function assessReadiness(req, res, next) {
  try {
    const value = await validated(readinessSchema, req.body, res); if (!value) return;
    const record = await sequelize.transaction(async (transaction) => {
      await assertCreateActor(req, transaction, ['org_admin', 'portfolio_manager']);
      const { project } = await validateCreateReferences(req, { projectId: req.params.projectId }, transaction);
      if (!project) throw Object.assign(new Error('Project not found.'), { integrationError: true, status: 404 });
      const score = calculateReadinessScore(value);
      const record = await ReadinessAssessment.create({ ...value, score, projectId: project.id, organizationId: req.tenant.organizationId }, { transaction });
      await recordAudit(req, { entityType: 'readiness_assessment', entityId: record.id, action: 'created', metadata: { score }, transaction });
      return record;
    });
    return res.status(201).json({ data: record });
  } catch (error) { return handleIntegrationError(error, res, next); }
}
export async function listEvidence(req, res, next) {
  try { return res.json({ data: await completeActiveRegister(EvidenceItem, { where: req.tenant, attributes: { exclude: ['storageKey'] }, order: [['createdAt', 'DESC']] }) }); }
  catch (error) { return handleIntegrationError(error, res, next); }
}
export async function createEvidence(req, res, next) {
  try {
    const value = await validated(evidenceSchema, req.body, res); if (!value) return;
    if (value.externalUrl && !safeEvidenceUrl(value.externalUrl)) return res.status(422).json({ error: 'Use an absolute HTTP(S) evidence URL without credentials.' });
    const record = await sequelize.transaction(async (transaction) => {
      await assertCreateActor(req, transaction);
      await validateCreateReferences(req, value, transaction);
      const record = await EvidenceItem.create({ ...value, organizationId: req.tenant.organizationId }, { transaction });
      await recordAudit(req, { entityType: 'evidence', entityId: record.id, action: 'created', transaction });
      return record;
    });
    return res.status(201).json({ data: record });
  } catch (error) { return handleIntegrationError(error, res, next); }
}
