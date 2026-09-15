import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { sequelize } from '../src/config/database.js';
import { CivicProject, Organization, ProjectConstraint, ProjectSelectorValue, SelectorOption } from '../src/models/index.js';
import { createProjectConstraint, findSelectorOptionSet, replaceProjectSelectorValues } from '../src/services/selectors.js';

const demoSlug = 'civicpath-demo';
let organization;
let project;
let deliverySet;
let constraintSet;
let severitySet;
let statusSet;
let createdConstraint;

async function option(setCode, optionCode) {
  const set = await findSelectorOptionSet({ code: setCode, organizationId: organization.id });
  return SelectorOption.findOne({ where: { optionSetId: set.id, organizationId: null, code: optionCode } });
}

before(async () => {
  await sequelize.authenticate();
  organization = await Organization.findOne({ where: { slug: demoSlug } });
  project = await CivicProject.findOne({ where: { organizationId: organization.id } });
  deliverySet = await findSelectorOptionSet({ code: 'project_delivery_stage', organizationId: organization.id });
  await ProjectSelectorValue.destroy({ where: { projectId: project.id, optionSetId: deliverySet.id }, force: true });
  await ProjectConstraint.destroy({ where: { projectId: project.id, constraintKey: 'other:seasonal access to the preferred site' }, force: true });
});

test('stores governed single-select values and rejects invalid cardinality', async () => {
  const concept = await option('project_delivery_stage', 'concept');
  const businessCase = await option('project_delivery_stage', 'business_case');
  await replaceProjectSelectorValues({ projectId: project.id, organizationId: organization.id, optionSet: deliverySet, selections: [{ optionId: concept.id }], actorId: null });
  assert.equal(await ProjectSelectorValue.count({ where: { projectId: project.id, optionSetId: deliverySet.id } }), 1);
  await assert.rejects(() => replaceProjectSelectorValues({ projectId: project.id, organizationId: organization.id, optionSet: deliverySet, selections: [{ optionId: concept.id }, { optionId: businessCase.id }], actorId: null }), /accepts one selection/);
});

test('stores an Other multi-select constraint with governed severity and status', async () => {
  constraintSet = await findSelectorOptionSet({ code: 'project_constraint', organizationId: organization.id });
  severitySet = await findSelectorOptionSet({ code: 'constraint_severity', organizationId: organization.id });
  statusSet = await findSelectorOptionSet({ code: 'constraint_status', organizationId: organization.id });
  const other = await option('project_constraint', 'other');
  const material = await option('constraint_severity', 'material');
  const open = await option('constraint_status', 'open');
  createdConstraint = await createProjectConstraint({ organizationId: organization.id, projectId: project.id, constraintOptionId: other.id, severityOptionId: material.id, statusOptionId: open.id, otherValue: '  seasonal access to the preferred site  ', actorId: null });
  assert.equal(createdConstraint.otherValue, 'seasonal access to the preferred site');
  assert.equal(createdConstraint.constraintKey, 'other:seasonal access to the preferred site');
  await assert.rejects(() => createProjectConstraint({ organizationId: organization.id, projectId: project.id, constraintOptionId: other.id, severityOptionId: open.id, statusOptionId: material.id, otherValue: 'wrong options', actorId: null }), /severity or status/);
});

after(async () => {
  if (createdConstraint) await ProjectConstraint.destroy({ where: { id: createdConstraint.id }, force: true });
  if (project && deliverySet) await ProjectSelectorValue.destroy({ where: { projectId: project.id, optionSetId: deliverySet.id }, force: true });
  await sequelize.close();
});
