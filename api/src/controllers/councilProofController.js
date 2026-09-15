import Joi from 'joi';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { CivicProject, Organization, OrganizationSelectorOptionOverride, Priority, ProjectConstraint, ProjectPriority, ProjectSelectorValue, SelectorOption, SelectorOptionSet, User } from '../models/index.js';
import { recordAudit } from '../services/audit.js';
import { createProjectConstraint, findSelectorOptionSet, replaceProjectSelectorValues, resolveSelectableOption, selectorValidationError } from '../services/selectors.js';

const selectionSchema = Joi.object({ selections: Joi.array().items(Joi.object({ optionId: Joi.string().uuid().required(), otherValue: Joi.string().max(500).allow('', null), metadata: Joi.object().default({}) })).required() });
const constraintSchema = Joi.object({ constraintOptionId: Joi.string().uuid().required(), severityOptionId: Joi.string().uuid().required(), statusOptionId: Joi.string().uuid().required(), otherValue: Joi.string().max(500).allow('', null), ownerId: Joi.string().uuid().allow(null), dueDate: Joi.date().iso().allow(null), detail: Joi.string().max(5000).allow('', null) });
const constraintUpdateSchema = Joi.object({ severityOptionId: Joi.string().uuid(), statusOptionId: Joi.string().uuid(), ownerId: Joi.string().uuid().allow(null), dueDate: Joi.date().iso().allow(null), detail: Joi.string().max(5000).allow('', null), resolutionNote: Joi.string().max(5000).allow('', null) }).min(1);

function validate(schema, body, res) {
  const { value, error } = schema.validate(body, { stripUnknown: true });
  if (error) { res.status(422).json({ error: error.message }); return null; }
  return value;
}

async function projectForTenant(req) {
  return CivicProject.findOne({ where: { ...req.tenant, id: req.params.projectId } });
}

async function selectedSetsForTenant(organizationId) {
  const records = await SelectorOptionSet.findAll({ where: { status: 'active', [Op.or]: [{ organizationId: null }, { organizationId }] }, order: [['code', 'ASC']] });
  return [...records.reduce((sets, record) => { const existing = sets.get(record.code); if (!existing || record.organizationId) sets.set(record.code, record); return sets; }, new Map()).values()];
}

export async function listCouncilProofSelectors(req, res, next) {
  try {
    const organization = await Organization.findOne({ where: { id: req.tenant.organizationId }, attributes: ['id', 'country', 'defaultCurrency'] });
    const sets = await selectedSetsForTenant(req.tenant.organizationId);
    const setIds = sets.map((set) => set.id);
    const options = await SelectorOption.findAll({
      where: { optionSetId: setIds, status: 'active', [Op.or]: [{ organizationId: null }, { organizationId: req.tenant.organizationId }] },
      include: [{ model: OrganizationSelectorOptionOverride, required: false, where: { organizationId: req.tenant.organizationId }, attributes: ['labelOverride', 'status', 'sortOrderOverride'] }],
      order: [['sortOrder', 'ASC'], ['label', 'ASC']],
    });
    const selectorSets = Object.fromEntries(sets.map((set) => [set.code, { id: set.id, code: set.code, label: set.label, description: set.description, selectionMode: set.selectionMode, maxSelections: set.maxSelections, allowsOther: set.allowsOther, options: options.filter((option) => option.optionSetId === set.id && !option.OrganizationSelectorOptionOverrides?.some((override) => override.status === 'hidden')).map((option) => ({ id: option.id, code: option.code, label: option.OrganizationSelectorOptionOverrides?.[0]?.labelOverride || option.label, description: option.description, isOther: option.isOther, isCustom: option.isCustom, value: option.value })) }]));
    return res.json({ data: { currencyCode: organization.defaultCurrency, country: organization.country, selectorSets } });
  } catch (error) { return next(error); }
}

export async function getProjectCouncilProof(req, res, next) {
  try {
    const project = await projectForTenant(req);
    if (!project) return res.status(404).json({ error: 'Project not found.' });
    const [priorities, selections, constraints] = await Promise.all([
      ProjectPriority.findAll({ where: { organizationId: req.tenant.organizationId, projectId: project.id }, include: [{ model: Priority, attributes: ['id', 'title'] }], order: [['isPrimary', 'DESC']] }),
      ProjectSelectorValue.findAll({ where: { organizationId: req.tenant.organizationId, projectId: project.id }, include: [{ model: SelectorOptionSet, attributes: ['id', 'code', 'label'] }, { model: SelectorOption, attributes: ['id', 'code', 'label', 'isOther'] }] }),
      ProjectConstraint.findAll({ where: { organizationId: req.tenant.organizationId, projectId: project.id }, include: [{ model: SelectorOption, as: 'constraintOption', attributes: ['id', 'code', 'label'] }, { model: SelectorOption, as: 'severityOption', attributes: ['id', 'code', 'label'] }, { model: SelectorOption, as: 'statusOption', attributes: ['id', 'code', 'label'] }, { model: User, as: 'constraintOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['createdAt', 'DESC']] }),
    ]);
    return res.json({ data: { project, priorities, selections, constraints } });
  } catch (error) { return next(error); }
}

export async function replaceProjectSelections(req, res, next) {
  try {
    const value = validate(selectionSchema, req.body, res); if (!value) return;
    const project = await projectForTenant(req); if (!project) return res.status(404).json({ error: 'Project not found.' });
    const optionSet = await findSelectorOptionSet({ code: req.params.selectorCode, organizationId: req.tenant.organizationId });
    if (!optionSet || optionSet.appliesTo !== 'project') return res.status(404).json({ error: 'Project selector not found.' });
    const selections = await sequelize.transaction(async (transaction) => {
      const records = await replaceProjectSelectorValues({ projectId: project.id, organizationId: req.tenant.organizationId, optionSet, selections: value.selections, actorId: req.auth.sub, transaction });
      if (['project_category', 'project_delivery_stage'].includes(optionSet.code) && records.length === 1) {
        const option = await SelectorOption.findByPk(records[0].optionId, { transaction });
        await project.update(optionSet.code === 'project_category' ? { category: option.code } : { stage: option.code }, { transaction });
      }
      return records;
    });
    await recordAudit(req, { entityType: 'project', entityId: project.id, action: 'selector_values_replaced', metadata: { selectorCode: optionSet.code, count: selections.length } });
    return res.json({ data: selections });
  } catch (error) { return next(error); }
}

export async function listProjectConstraints(req, res, next) {
  try {
    const project = await projectForTenant(req); if (!project) return res.status(404).json({ error: 'Project not found.' });
    const data = await ProjectConstraint.findAll({ where: { organizationId: req.tenant.organizationId, projectId: project.id }, include: [{ model: SelectorOption, as: 'constraintOption', attributes: ['id', 'code', 'label'] }, { model: SelectorOption, as: 'severityOption', attributes: ['id', 'code', 'label'] }, { model: SelectorOption, as: 'statusOption', attributes: ['id', 'code', 'label'] }, { model: User, as: 'constraintOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['createdAt', 'DESC']] });
    return res.json({ data });
  } catch (error) { return next(error); }
}

export async function createConstraint(req, res, next) {
  try {
    const value = validate(constraintSchema, req.body, res); if (!value) return;
    const project = await projectForTenant(req); if (!project) return res.status(404).json({ error: 'Project not found.' });
    const record = await sequelize.transaction((transaction) => createProjectConstraint({ ...value, organizationId: req.tenant.organizationId, projectId: project.id, actorId: req.auth.sub, transaction }));
    await recordAudit(req, { entityType: 'project_constraint', entityId: record.id, action: 'created', metadata: { projectId: project.id } });
    return res.status(201).json({ data: record });
  } catch (error) { return next(error); }
}

export async function updateConstraint(req, res, next) {
  try {
    const value = validate(constraintUpdateSchema, req.body, res); if (!value) return;
    const record = await ProjectConstraint.findOne({ where: { organizationId: req.tenant.organizationId, projectId: req.params.projectId, id: req.params.constraintId } });
    if (!record) return res.status(404).json({ error: 'Project constraint not found.' });
    if (value.severityOptionId || value.statusOptionId) {
      const severitySet = await findSelectorOptionSet({ code: 'constraint_severity', organizationId: req.tenant.organizationId });
      const statusSet = await findSelectorOptionSet({ code: 'constraint_status', organizationId: req.tenant.organizationId });
      if (!severitySet || !statusSet) throw selectorValidationError('The project-constraint catalogue is unavailable for this council.');
      if (value.severityOptionId && !(await resolveSelectableOption({ optionSetId: severitySet.id, optionId: value.severityOptionId, organizationId: req.tenant.organizationId }))) throw selectorValidationError('The selected constraint severity is unavailable for this council.');
      if (value.statusOptionId && !(await resolveSelectableOption({ optionSetId: statusSet.id, optionId: value.statusOptionId, organizationId: req.tenant.organizationId }))) throw selectorValidationError('The selected constraint status is unavailable for this council.');
    }
    if (value.ownerId && !(await User.findOne({ where: { id: value.ownerId, organizationId: req.tenant.organizationId, status: 'active' } }))) throw selectorValidationError('The selected constraint owner is unavailable for this council.');
    const status = value.statusOptionId ? await SelectorOption.findByPk(value.statusOptionId) : null;
    await record.update({ ...value, resolvedAt: status?.code === 'resolved' ? new Date() : value.statusOptionId ? null : record.resolvedAt });
    await recordAudit(req, { entityType: 'project_constraint', entityId: record.id, action: 'updated', metadata: Object.keys(value) });
    return res.json({ data: record });
  } catch (error) { return next(error); }
}
