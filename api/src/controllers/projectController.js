import Joi from 'joi';
import { sequelize } from '../config/database.js';
import { CivicProject, Organization, Priority, ProjectPriority, ReadinessAssessment } from '../models/index.js';
import { recordAudit } from '../services/audit.js';
import { createProjectConstraint, findSelectorOptionSet, replaceProjectSelectorValues, resolveSelectableOption, selectorValidationError } from '../services/selectors.js';

const projectSchema = Joi.object({
  name: Joi.string().max(200).required(), summary: Joi.string().allow('', null), priorityId: Joi.string().uuid().allow(null), ownerId: Joi.string().uuid().allow(null),
  category: Joi.string().valid('economic_development', 'infrastructure', 'community', 'environment', 'strategic_planning', 'other'), stage: Joi.string().valid('concept', 'scoping', 'business_case', 'funding_ready', 'approved', 'delivery', 'completed', 'on_hold'),
  estimatedCost: Joi.number().min(0).allow(null), targetFunding: Joi.number().min(0).allow(null), expectedJobs: Joi.number().integer().min(0).allow(null), expectedBenefit: Joi.string().max(240).allow('', null), targetDate: Joi.date().iso().allow(null), currencyCode: Joi.string().valid('AUD', 'NZD'),
  priorityIds: Joi.array().items(Joi.string().uuid()).unique().max(12),
  categorySelection: Joi.object({ optionId: Joi.string().uuid().required(), otherValue: Joi.string().max(500).allow('', null) }),
  stageSelection: Joi.object({ optionId: Joi.string().uuid().required(), otherValue: Joi.string().max(500).allow('', null) }),
  constraintSelections: Joi.array().items(Joi.object({ constraintOptionId: Joi.string().uuid().required(), severityOptionId: Joi.string().uuid().required(), statusOptionId: Joi.string().uuid().required(), otherValue: Joi.string().max(500).allow('', null), ownerId: Joi.string().uuid().allow(null), dueDate: Joi.date().iso().allow(null), detail: Joi.string().max(5000).allow('', null) })).max(30),
});

async function resolveLegacySelector({ organizationId, selectorCode, selection, transaction }) {
  const optionSet = await findSelectorOptionSet({ code: selectorCode, organizationId, transaction });
  if (!optionSet) throw selectorValidationError(`${selectorCode} is not configured for this council.`);
  const option = await resolveSelectableOption({ optionSetId: optionSet.id, optionId: selection.optionId, organizationId, transaction });
  if (!option) throw selectorValidationError('The selected option is unavailable for this council.');
  if (option.isOther && !selection.otherValue?.trim()) throw selectorValidationError(`A description is required when selecting ${option.label}.`);
  if (!option.isOther && selection.otherValue?.trim()) throw selectorValidationError('Custom text may only be used with an Other option.');
  return { optionSet, option };
}

async function syncProjectPriorities({ project, organizationId, priorityIds, actorId, transaction }) {
  if (!priorityIds) return;
  const priorities = await Priority.findAll({ where: { organizationId, status: 'active', id: priorityIds }, transaction });
  if (priorities.length !== priorityIds.length) throw selectorValidationError('One or more selected priorities are unavailable for this council.');
  await ProjectPriority.destroy({ where: { projectId: project.id }, force: true, transaction });
  await ProjectPriority.bulkCreate(priorityIds.map((priorityId, index) => ({ organizationId, projectId: project.id, priorityId, isPrimary: index === 0, assignedBy: actorId || null })), { transaction });
  await project.update({ priorityId: priorityIds[0] || null }, { transaction });
}

export async function listProjects(req, res, next) {
  try { return res.json({ data: await CivicProject.findAll({ where: req.tenant, include: [{ model: Priority, attributes: ['id', 'title'] }, { model: ReadinessAssessment, limit: 1, order: [['assessedAt', 'DESC']] }], order: [['updatedAt', 'DESC']] }) }); } catch (error) { return next(error); }
}

export async function createProject(req, res, next) {
  try {
    const { value, error } = projectSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const { priorityIds, categorySelection, stageSelection, constraintSelections, ...attributes } = value;
    const project = await sequelize.transaction(async (transaction) => {
      const organizationId = req.tenant.organizationId;
      const category = categorySelection ? await resolveLegacySelector({ organizationId, selectorCode: 'project_category', selection: categorySelection, transaction }) : null;
      const stage = stageSelection ? await resolveLegacySelector({ organizationId, selectorCode: 'project_delivery_stage', selection: stageSelection, transaction }) : null;
      const organization = await Organization.findByPk(organizationId, { attributes: ['defaultCurrency'], transaction });
      const record = await CivicProject.create({ ...attributes, currencyCode: attributes.currencyCode || organization?.defaultCurrency || 'AUD', category: category?.option.code || attributes.category, stage: stage?.option.code || attributes.stage, organizationId }, { transaction });
      if (category) await replaceProjectSelectorValues({ projectId: record.id, organizationId, optionSet: category.optionSet, selections: [categorySelection], actorId: req.auth.sub, transaction });
      if (stage) await replaceProjectSelectorValues({ projectId: record.id, organizationId, optionSet: stage.optionSet, selections: [stageSelection], actorId: req.auth.sub, transaction });
      if (priorityIds) await syncProjectPriorities({ project: record, organizationId, priorityIds, actorId: req.auth.sub, transaction });
      for (const constraint of constraintSelections || []) await createProjectConstraint({ organizationId, projectId: record.id, ...constraint, actorId: req.auth.sub, transaction });
      return record;
    });
    await recordAudit(req, { entityType: 'project', entityId: project.id, action: 'created', metadata: { name: project.name, source: 'council_proof_form' } });
    const response = await CivicProject.findOne({ where: { ...req.tenant, id: project.id }, include: [{ model: Priority, attributes: ['id', 'title'] }] });
    return res.status(201).json({ data: response });
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
