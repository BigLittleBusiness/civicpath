import { Op } from 'sequelize';
import { OrganizationSelectorOptionOverride, ProjectConstraint, ProjectSelectorValue, SelectorOption, SelectorOptionSet } from '../models/index.js';

export function selectorValidationError(message) {
  const error = new Error(message);
  error.name = 'SelectorValidationError';
  return error;
}

export function normaliseOtherValue(value) {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-AU');
}

export async function findSelectorOptionSet({ code, organizationId, transaction }) {
  return SelectorOptionSet.findOne({
    where: { code, status: 'active', [Op.or]: [{ organizationId }, { organizationId: null }] },
    order: [['organizationId', 'DESC']],
    transaction,
  });
}

export async function resolveSelectableOption({ optionSetId, optionId, organizationId, transaction }) {
  const option = await SelectorOption.findOne({
    where: { id: optionId, optionSetId, status: 'active', [Op.or]: [{ organizationId }, { organizationId: null }] },
    include: [{ model: OrganizationSelectorOptionOverride, required: false, where: { organizationId } }],
    transaction,
  });
  if (!option || option.OrganizationSelectorOptionOverrides?.some((override) => override.status === 'hidden')) return null;
  return option;
}

export async function replaceProjectSelectorValues({ projectId, organizationId, optionSet, selections, actorId, transaction }) {
  if (!Array.isArray(selections) || !selections.length) {
    await ProjectSelectorValue.destroy({ where: { projectId, organizationId, optionSetId: optionSet.id }, force: true, transaction });
    return [];
  }
  if (optionSet.selectionMode === 'single' && selections.length !== 1) throw selectorValidationError(`${optionSet.label} accepts one selection.`);
  if (optionSet.maxSelections && selections.length > optionSet.maxSelections) throw selectorValidationError(`${optionSet.label} allows up to ${optionSet.maxSelections} selections.`);

  const seen = new Set();
  const rows = [];
  for (const selection of selections) {
    const option = await resolveSelectableOption({ optionSetId: optionSet.id, optionId: selection.optionId, organizationId, transaction });
    if (!option) throw selectorValidationError('One or more selected options are unavailable for this council.');
    const otherValue = selection.otherValue?.trim() || null;
    if (option.isOther && !otherValue) throw selectorValidationError(`A description is required when selecting ${option.label}.`);
    if (!option.isOther && otherValue) throw selectorValidationError('Custom text may only be stored against an Other option.');
    if (seen.has(option.id)) throw selectorValidationError('The same option cannot be selected more than once.');
    seen.add(option.id);
    rows.push({ organizationId, projectId, optionSetId: optionSet.id, optionId: option.id, otherValue, otherValueNormalized: otherValue ? normaliseOtherValue(otherValue) : null, selectedBy: actorId || null, metadata: selection.metadata || {} });
  }
  await ProjectSelectorValue.destroy({ where: { projectId, organizationId, optionSetId: optionSet.id }, force: true, transaction });
  return ProjectSelectorValue.bulkCreate(rows, { transaction });
}

export async function createProjectConstraint({ organizationId, projectId, constraintOptionId, severityOptionId, statusOptionId, otherValue, ownerId, dueDate, detail, actorId, transaction }) {
  const constraintSet = await findSelectorOptionSet({ code: 'project_constraint', organizationId, transaction });
  const severitySet = await findSelectorOptionSet({ code: 'constraint_severity', organizationId, transaction });
  const statusSet = await findSelectorOptionSet({ code: 'constraint_status', organizationId, transaction });
  if (!constraintSet || !severitySet || !statusSet) throw selectorValidationError('The project-constraint catalogue is unavailable for this council.');
  const constraintOption = await resolveSelectableOption({ optionSetId: constraintSet.id, optionId: constraintOptionId, organizationId, transaction });
  const severityOption = await resolveSelectableOption({ optionSetId: severitySet.id, optionId: severityOptionId, organizationId, transaction });
  const statusOption = await resolveSelectableOption({ optionSetId: statusSet.id, optionId: statusOptionId, organizationId, transaction });
  if (!constraintOption) throw selectorValidationError('The selected constraint is unavailable for this council.');
  if (!severityOption || !statusOption) throw selectorValidationError('The selected constraint severity or status is unavailable for this council.');
  const customText = otherValue?.trim() || null;
  if (constraintOption.isOther && !customText) throw selectorValidationError('A description is required for an Other constraint.');
  if (!constraintOption.isOther && customText) throw selectorValidationError('Custom text may only be stored against an Other constraint.');
  const constraintKey = constraintOption.isOther ? `other:${normaliseOtherValue(customText)}` : constraintOption.code;
  return ProjectConstraint.create({ organizationId, projectId, constraintOptionId, constraintKey, otherValue: customText, severityOptionId, statusOptionId, ownerId: ownerId || null, dueDate: dueDate || null, detail: detail || null, createdBy: actorId || null }, { transaction });
}
