import { DataTypes, Op } from 'sequelize';
import { sequelize } from '../../src/config/database.js';
import { CivicProject, FundingPathway, Grant, Organization, OrganizationSelectorOptionOverride, ProjectConstraint, ProjectPriority, ProjectSelectorValue, SelectorOption, SelectorOptionSet } from '../../src/models/index.js';

const optionSets = [
  ['account_team_size', 'Team size', 'organization', 'single', false, [['one_to_three', '1–3 people'], ['four_to_ten', '4–10 people'], ['eleven_to_twenty_five', '11–25 people'], ['twenty_six_to_fifty', '26–50 people'], ['fifty_one_to_one_hundred', '51–100 people'], ['more_than_one_hundred', '100+ people']]],
  ['council_proof_pathway', 'Council Proof pathway', 'organization', 'single', false, [['readiness_investment_case', 'Project readiness and investment case'], ['funding_grant_readiness', 'Funding pathways and grant readiness'], ['economic_development_growth', 'Economic development and strategic growth'], ['executive_portfolio_visibility', 'Executive portfolio visibility'], ['grant_lifecycle', 'Grant lifecycle coordination']]],
  ['project_category', 'Project category', 'project', 'single', true, [['economic_development', 'Economic development'], ['infrastructure', 'Infrastructure'], ['community', 'Community'], ['environment', 'Environment'], ['strategic_planning', 'Strategic planning'], ['other', 'Other', true]]],
  ['project_delivery_stage', 'Delivery stage', 'project', 'single', false, [['concept', 'Concept'], ['scoping', 'Scoping'], ['business_case', 'Business case'], ['funding_ready', 'Funding-ready'], ['approved', 'Approved'], ['delivery', 'Delivery'], ['completed', 'Completed'], ['on_hold', 'On hold']]],
  ['readiness_score_level', 'Readiness level', 'readiness_assessment', 'single', false, [['not_assessed', 'Not assessed', false, { score: 0 }], ['early', 'Early', false, { score: 1 }], ['developing', 'Developing', false, { score: 2 }], ['defined', 'Defined', false, { score: 3 }], ['validated', 'Validated', false, { score: 4 }], ['decision_ready', 'Decision-ready', false, { score: 5 }]]],
  ['funding_pathway_type', 'Funding pathway type', 'funding_pathway', 'single', true, [['grant', 'Grant'], ['loan', 'Loan'], ['council', 'Council budget'], ['partner', 'Partnership'], ['private', 'Private investment'], ['other', 'Other', true]]],
  ['project_constraint', 'Known constraint', 'project_constraint', 'multi', true, [['scope_definition', 'Scope definition'], ['cost_certainty', 'Cost certainty'], ['business_case', 'Business case'], ['land_or_site', 'Land or site'], ['planning_or_approvals', 'Planning or regulatory approvals'], ['environment_or_heritage', 'Environment or heritage'], ['partner_commitment', 'Partner commitment'], ['co_funding', 'Co-funding'], ['procurement', 'Procurement'], ['staff_capacity', 'Staff capacity'], ['technical_capability', 'Technical capability'], ['community_support', 'Community support'], ['market_demand', 'Market demand'], ['evidence_gap', 'Evidence gap'], ['governance_decision', 'Governance decision required'], ['other', 'Other', true]]],
  ['constraint_severity', 'Constraint severity', 'project_constraint', 'single', false, [['watch', 'Watch'], ['material', 'Material'], ['critical', 'Critical']]],
  ['constraint_status', 'Constraint status', 'project_constraint', 'single', false, [['open', 'Open'], ['mitigating', 'Mitigating'], ['accepted', 'Accepted'], ['resolved', 'Resolved']]],
];

async function ensureColumn(table, column, definition) {
  const schema = await sequelize.getQueryInterface().describeTable(table);
  if (!schema[column]) await sequelize.getQueryInterface().addColumn(table, column, definition);
}

try {
  await sequelize.authenticate();
  await ensureColumn(Organization.getTableName(), 'default_currency', { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'AUD' });
  await ensureColumn(CivicProject.getTableName(), 'currency_code', { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'AUD' });
  await ensureColumn(FundingPathway.getTableName(), 'currency_code', { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'AUD' });
  await ensureColumn(Grant.getTableName(), 'currency_code', { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'AUD' });
  await sequelize.query("UPDATE `Organization` SET `default_currency` = CASE WHEN `country` = 'NZ' THEN 'NZD' ELSE 'AUD' END WHERE `default_currency` IS NULL OR `default_currency` = 'AUD'");
  await SelectorOptionSet.sync();
  await SelectorOption.sync();
  await OrganizationSelectorOptionOverride.sync();
  await ProjectPriority.sync();
  await ProjectSelectorValue.sync();
  await ProjectConstraint.sync();

  for (const [code, label, appliesTo, selectionMode, allowsOther, options] of optionSets) {
    const [set] = await SelectorOptionSet.findOrCreate({ where: { organizationId: null, code }, defaults: { code, label, appliesTo, selectionMode, allowsOther, scope: 'platform', status: 'active' } });
    for (let index = 0; index < options.length; index += 1) {
      const [optionCode, optionLabel, isOther = false, value = {}] = options[index];
      await SelectorOption.findOrCreate({ where: { optionSetId: set.id, organizationId: null, code: optionCode }, defaults: { optionSetId: set.id, code: optionCode, label: optionLabel, sortOrder: index + 1, isOther, isCustom: false, status: 'active', value } });
    }
  }

  for (const project of await CivicProject.findAll({ where: { priorityId: { [Op.ne]: null } } })) {
    await ProjectPriority.findOrCreate({ where: { projectId: project.id, priorityId: project.priorityId }, defaults: { organizationId: project.organizationId, projectId: project.id, priorityId: project.priorityId, isPrimary: true } });
  }
  console.info('CivicPath structured selector schema is ready.');
} catch (error) {
  console.error('CivicPath structured selector migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
