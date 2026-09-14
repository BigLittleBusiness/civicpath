import Joi from 'joi';
import { CivicProject, Priority, ReadinessAssessment } from '../models/index.js';
import { recordAudit } from '../services/audit.js';

const projectSchema = Joi.object({
  name: Joi.string().max(200).required(), summary: Joi.string().allow('', null), priorityId: Joi.string().uuid().allow(null), ownerId: Joi.string().uuid().allow(null),
  category: Joi.string().valid('economic_development', 'infrastructure', 'community', 'environment', 'strategic_planning', 'other'), stage: Joi.string().valid('concept', 'scoping', 'business_case', 'funding_ready', 'approved', 'delivery', 'completed', 'on_hold'),
  estimatedCost: Joi.number().min(0).allow(null), targetFunding: Joi.number().min(0).allow(null), expectedJobs: Joi.number().integer().min(0).allow(null), expectedBenefit: Joi.string().max(240).allow('', null), targetDate: Joi.date().iso().allow(null),
});

export async function listProjects(req, res, next) {
  try { return res.json({ data: await CivicProject.findAll({ where: req.tenant, include: [{ model: Priority, attributes: ['id', 'title'] }, { model: ReadinessAssessment, limit: 1, order: [['assessedAt', 'DESC']] }], order: [['updatedAt', 'DESC']] }) }); } catch (error) { return next(error); }
}

export async function createProject(req, res, next) {
  try {
    const { value, error } = projectSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const project = await CivicProject.create({ ...value, organizationId: req.tenant.organizationId });
    await recordAudit(req, { entityType: 'project', entityId: project.id, action: 'created', metadata: { name: project.name } });
    return res.status(201).json({ data: project });
  } catch (error) { return next(error); }
}

export async function updateProject(req, res, next) {
  try {
    const { value, error } = projectSchema.validate(req.body, { stripUnknown: true, presence: 'optional' });
    if (error) return res.status(422).json({ error: error.message });
    const project = await CivicProject.findOne({ where: { ...req.tenant, id: req.params.projectId } });
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    await project.update(value);
    await recordAudit(req, { entityType: 'project', entityId: project.id, action: 'updated', metadata: Object.keys(value) });
    return res.json({ data: project });
  } catch (error) { return next(error); }
}

