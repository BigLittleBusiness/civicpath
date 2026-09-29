import Joi from 'joi';
import { Op } from 'sequelize';
import { parseCsv } from '../utils/csv.js';
import {
  ActionDependency,
  ActionEvidenceLink,
  ActionFundingPosition,
  ActionMilestone,
  CivicProject,
  QuarterlyActionUpdate,
  QuarterlyReportingPeriod,
  StrategyAction,
  StrategyActionProject,
  StrategyAlert,
  StrategyDecision,
  StrategyFocusArea,
  StrategyMeasure,
  StrategyReportSnapshot,
  StrategyRiskIssue,
  StrategyStakeholder,
  StrategicPlan,
  StrategyStatusDefinition,
  User,
} from '../models/index.js';
import { recordAudit } from '../services/audit.js';

const STATUS_DEFINITIONS = [
  { code: 'not_started', label: 'Not started', category: 'not_started', color: '#7c8a86', sortOrder: 1, isDefault: true },
  { code: 'on_track', label: 'On track', category: 'on_track', color: '#178568', sortOrder: 2, isDefault: true },
  { code: 'attention', label: 'Attention required', category: 'attention', color: '#d18d2d', sortOrder: 3, isDefault: true },
  { code: 'off_track', label: 'Off track', category: 'off_track', color: '#b85d4f', sortOrder: 4, isDefault: true },
  { code: 'complete', label: 'Complete', category: 'complete', color: '#315a7c', sortOrder: 5, isDefault: true },
];

const strategySchema = Joi.object({
  name: Joi.string().max(240).required(), reference: Joi.string().max(180).allow('', null), version: Joi.string().max(80).allow('', null), description: Joi.string().max(12000).allow('', null),
  ownerId: Joi.string().uuid().allow(null), startDate: Joi.date().iso().allow(null), endDate: Joi.date().iso().allow(null), reportingCadence: Joi.string().valid('monthly', 'quarterly', 'half_yearly', 'annual').default('quarterly'), status: Joi.string().valid('draft', 'active', 'archived').default('draft'),
});
const focusSchema = Joi.object({ code: Joi.string().max(80).required(), title: Joi.string().max(200).required(), description: Joi.string().max(5000).allow('', null), sortOrder: Joi.number().integer().min(0).max(999).default(0) });
const actionSchema = Joi.object({
  focusAreaId: Joi.string().uuid().allow(null), ownerId: Joi.string().uuid().allow(null), actionCode: Joi.string().max(80).allow('', null), title: Joi.string().max(300).required(), description: Joi.string().max(12000).allow('', null),
  contributingTeams: Joi.array().items(Joi.string().max(160)).max(30).default([]), deliveryPathway: Joi.string().valid('operational', 'capital', 'partnership', 'advocacy', 'policy', 'program', 'other').default('operational'), status: Joi.string().max(60).default('not_started'), statusRationale: Joi.string().max(8000).allow('', null),
  startDate: Joi.date().iso().allow(null), targetDate: Joi.date().iso().allow(null), nextStep: Joi.string().max(8000).allow('', null), nextDecision: Joi.string().max(8000).allow('', null), nextDecisionDueAt: Joi.date().iso().allow(null),
  estimatedCost: Joi.number().min(0).allow(null), securedFunding: Joi.number().min(0).default(0), currencyCode: Joi.string().valid('AUD', 'NZD').default('AUD'), budgetStatus: Joi.string().valid('not_costed', 'indicative', 'approved', 'funded', 'not_required').default('not_costed'), readinessScore: Joi.number().integer().min(0).max(100).default(0), reportingPriority: Joi.string().valid('standard', 'executive', 'critical').default('standard'), isActive: Joi.boolean().default(true),
});
const milestoneSchema = Joi.object({ ownerId: Joi.string().uuid().allow(null), title: Joi.string().max(240).required(), description: Joi.string().max(8000).allow('', null), dueDate: Joi.date().iso().allow(null), completedAt: Joi.date().iso().allow(null), status: Joi.string().valid('not_started', 'in_progress', 'blocked', 'complete').default('not_started'), completionEvidence: Joi.string().max(8000).allow('', null), varianceExplanation: Joi.string().max(8000).allow('', null) });
const dependencySchema = Joi.object({
  dependentType: Joi.string().valid('action', 'project', 'milestone').required(), dependentId: Joi.string().uuid().required(), predecessorType: Joi.string().valid('action', 'project', 'milestone').required(), predecessorId: Joi.string().uuid().required(), dependencyType: Joi.string().valid('decision', 'funding', 'land', 'planning_approval', 'procurement', 'capability', 'evidence', 'partner_commitment', 'infrastructure', 'policy', 'legislative', 'community_engagement', 'other').default('other'), severity: Joi.string().valid('monitor', 'material', 'critical').default('material'), status: Joi.string().valid('open', 'progressing', 'resolved', 'accepted_risk', 'not_applicable').default('open'), ownerId: Joi.string().uuid().allow(null), dueDate: Joi.date().iso().allow(null), escalationAt: Joi.date().iso().allow(null), resolutionDate: Joi.date().iso().allow(null), detail: Joi.string().max(8000).allow('', null), workaround: Joi.string().max(8000).allow('', null), resolutionEvidence: Joi.string().max(8000).allow('', null), resolutionNote: Joi.string().max(8000).allow('', null),
});
const periodSchema = Joi.object({ label: Joi.string().max(120).required(), financialYear: Joi.string().max(20).required(), quarter: Joi.string().valid('Q1', 'Q2', 'Q3', 'Q4').required(), startsOn: Joi.date().iso().required(), endsOn: Joi.date().iso().required(), updateDueOn: Joi.date().iso().allow(null), status: Joi.string().valid('preparing', 'open', 'locked', 'finalised').default('preparing') });
const updateSchema = Joi.object({ actionId: Joi.string().uuid().required(), status: Joi.string().max(60).required(), movement: Joi.string().valid('advanced', 'no_change', 'slipped', 'completed', 'new_risk').default('advanced'), achievements: Joi.string().max(12000).allow('', null), evidenceSummary: Joi.string().max(12000).allow('', null), riskSummary: Joi.string().max(12000).allow('', null), decisionsRequired: Joi.string().max(12000).allow('', null), nextQuarterCommitments: Joi.string().max(12000).allow('', null) });
const measureSchema = Joi.object({ name: Joi.string().max(200).required(), description: Joi.string().max(8000).allow('', null), unit: Joi.string().max(80).allow('', null), baselineValue: Joi.string().max(120).allow('', null), baselineDate: Joi.date().iso().allow(null), targetValue: Joi.string().max(120).allow('', null), targetDate: Joi.date().iso().allow(null), currentValue: Joi.string().max(120).allow('', null), lastMeasuredAt: Joi.date().iso().allow(null), reportingFrequency: Joi.string().valid('monthly', 'quarterly', 'half_yearly', 'annual', 'ad_hoc').default('quarterly'), evidence: Joi.string().max(8000).allow('', null) });
const decisionSchema = Joi.object({ actionId: Joi.string().uuid().allow(null), projectId: Joi.string().uuid().allow(null), ownerId: Joi.string().uuid().allow(null), title: Joi.string().max(260).required(), recommendation: Joi.string().max(12000).allow('', null), decisionStatus: Joi.string().valid('draft', 'required', 'approved', 'declined', 'deferred', 'implemented').default('draft'), decisionMaker: Joi.string().max(180).allow('', null), dueDate: Joi.date().iso().allow(null), decidedAt: Joi.date().iso().allow(null), decisionText: Joi.string().max(12000).allow('', null), followUpAction: Joi.string().max(12000).allow('', null) });
const stakeholderSchema = Joi.object({ ownerId: Joi.string().uuid().allow(null), name: Joi.string().max(180).required(), organisationName: Joi.string().max(180).allow('', null), stakeholderType: Joi.string().valid('internal', 'government', 'business', 'community', 'delivery_partner', 'investor', 'other').default('other'), roleDescription: Joi.string().max(8000).allow('', null), influence: Joi.string().valid('low', 'medium', 'high').default('medium'), engagementStatus: Joi.string().valid('not_started', 'engaged', 'supportive', 'watching', 'at_risk').default('not_started'), nextEngagementAt: Joi.date().iso().allow(null) });
const riskSchema = Joi.object({ actionId: Joi.string().uuid().allow(null), dependencyId: Joi.string().uuid().allow(null), ownerId: Joi.string().uuid().allow(null), issueType: Joi.string().valid('risk', 'issue').default('risk'), title: Joi.string().max(260).required(), detail: Joi.string().max(12000).allow('', null), status: Joi.string().valid('open', 'monitoring', 'mitigating', 'resolved', 'accepted').default('open'), impact: Joi.number().integer().min(1).max(5).allow(null), likelihood: Joi.number().integer().min(1).max(5).allow(null), mitigation: Joi.string().max(12000).allow('', null), dueDate: Joi.date().iso().allow(null), resolvedAt: Joi.date().iso().allow(null) });
const fundingSchema = Joi.object({ sourceName: Joi.string().max(200).required(), sourceType: Joi.string().valid('grant', 'budget', 'partner', 'private', 'advocacy', 'other').default('other'), amount: Joi.number().min(0).allow(null), currencyCode: Joi.string().valid('AUD', 'NZD').default('AUD'), status: Joi.string().valid('identified', 'preparing', 'submitted', 'approved', 'secured', 'not_proceeding').default('identified'), dueDate: Joi.date().iso().allow(null), note: Joi.string().max(8000).allow('', null) });
const evidenceSchema = Joi.object({ title: Joi.string().max(240).required(), evidenceType: Joi.string().valid('document', 'metric', 'decision_record', 'link', 'other').default('document'), externalUrl: Joi.string().uri().allow('', null), source: Joi.string().max(240).allow('', null), isVerified: Joi.boolean().default(false) });
const reportSchema = Joi.object({ status: Joi.string().valid('draft', 'reviewed', 'approved').default('draft'), narrative: Joi.string().max(30000).allow('', null) });
const importSchema = Joi.object({ csv: Joi.string().max(1024 * 1024).required() });

function validation(schema, body, res, { partial = false } = {}) {
  const target = partial ? schema.fork(Object.keys(schema.describe().keys), (field) => field.optional()) : schema;
  const { value, error } = target.validate(body, { stripUnknown: true, noDefaults: partial });
  if (error) { res.status(422).json({ error: error.message }); return null; }
  return value;
}
function plain(record) { return record?.get ? record.get({ plain: true }) : record; }
function todayIso() { return new Date().toISOString().slice(0, 10); }
function asDate(value) { return value ? new Date(`${value}T00:00:00Z`) : null; }
function plusDays(value, days) { const date = asDate(value) || new Date(); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); }
function fiscalQuarter(date) { const d = asDate(date) || new Date(); const month = d.getUTCMonth() + 1; const startYear = month >= 7 ? d.getUTCFullYear() : d.getUTCFullYear() - 1; const quarter = month >= 7 && month <= 9 ? 'Q1' : month <= 12 ? 'Q2' : month <= 3 ? 'Q3' : 'Q4'; return { financialYear: `${startYear}-${String(startYear + 1).slice(-2)}`, quarter }; }
function quarterBounds(financialYear, quarter) { const startYear = Number(String(financialYear).slice(0, 4)); const month = { Q1: 6, Q2: 9, Q3: 0, Q4: 3 }[quarter]; const year = quarter === 'Q3' || quarter === 'Q4' ? startYear + 1 : startYear; const start = new Date(Date.UTC(year, month, 1)); const end = new Date(Date.UTC(year, month + 3, 0)); return { startsOn: start.toISOString().slice(0, 10), endsOn: end.toISOString().slice(0, 10) }; }

async function ensureStrategy(req, strategyId) {
  return StrategicPlan.findOne({ where: { id: strategyId, organizationId: req.tenant.organizationId } });
}
async function ensureAction(req, actionId) {
  return StrategyAction.findOne({ where: { id: actionId, organizationId: req.tenant.organizationId } });
}
async function ownerExists(organizationId, userId) {
  if (!userId) return true;
  return Boolean(await User.findOne({ where: { id: userId, organizationId } }));
}
async function ensureDefaults(organizationId, strategyId) {
  for (const item of STATUS_DEFINITIONS) await StrategyStatusDefinition.findOrCreate({ where: { strategyId, code: item.code }, defaults: { ...item, organizationId, strategyId } });
}
async function ensureReference(req, type, id, strategyId) {
  const organizationId = req.tenant.organizationId;
  if (type === 'action') return StrategyAction.findOne({ where: { id, organizationId, strategyId } });
  if (type === 'project') return CivicProject.findOne({ where: { id, organizationId } });
  if (type === 'milestone') {
    const milestone = await ActionMilestone.findOne({ where: { id, organizationId } });
    if (!milestone) return null;
    const action = await StrategyAction.findOne({ where: { id: milestone.actionId, organizationId, strategyId } });
    return action ? milestone : null;
  }
  return null;
}
async function resolveReferences(organizationId, rows) {
  const actionIds = new Set(); const projectIds = new Set(); const milestoneIds = new Set();
  for (const row of rows) {
    for (const [type, id] of [[row.dependentType, row.dependentId], [row.predecessorType, row.predecessorId]]) {
      if (type === 'action') actionIds.add(id); if (type === 'project') projectIds.add(id); if (type === 'milestone') milestoneIds.add(id);
    }
  }
  const [actions, projects, milestones] = await Promise.all([
    actionIds.size ? StrategyAction.findAll({ where: { organizationId, id: [...actionIds] }, attributes: ['id', 'actionCode', 'title'] }) : [],
    projectIds.size ? CivicProject.findAll({ where: { organizationId, id: [...projectIds] }, attributes: ['id', 'name'] }) : [],
    milestoneIds.size ? ActionMilestone.findAll({ where: { organizationId, id: [...milestoneIds] }, attributes: ['id', 'title'] }) : [],
  ]);
  const labels = { action: Object.fromEntries(actions.map((row) => [row.id, `${row.actionCode ? `${row.actionCode} · ` : ''}${row.title}`])), project: Object.fromEntries(projects.map((row) => [row.id, row.name])), milestone: Object.fromEntries(milestones.map((row) => [row.id, row.title])) };
  return rows.map((row) => ({ ...plain(row), dependentLabel: labels[row.dependentType]?.[row.dependentId] || 'Unavailable record', predecessorLabel: labels[row.predecessorType]?.[row.predecessorId] || 'Unavailable record' }));
}
async function actionDetail(organizationId, actionId) {
  const action = await StrategyAction.findOne({
    where: { organizationId, id: actionId },
    include: [
      { model: StrategyFocusArea, attributes: ['id', 'code', 'title'] },
      { model: User, as: 'actionOwner', attributes: ['id', 'firstName', 'lastName', 'role'] },
      { model: CivicProject, as: 'linkedProjects', attributes: ['id', 'name', 'stage', 'estimatedCost', 'targetFunding'], through: { attributes: ['relationshipType'] } },
      { model: ActionMilestone, include: [{ model: User, as: 'milestoneOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['dueDate', 'ASC']] },
      { model: QuarterlyActionUpdate, include: [{ model: QuarterlyReportingPeriod, attributes: ['id', 'label', 'financialYear', 'quarter'] }], order: [['createdAt', 'DESC']] },
      { model: StrategyMeasure, order: [['createdAt', 'ASC']] },
      { model: StrategyStakeholder, include: [{ model: User, as: 'stakeholderOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['nextEngagementAt', 'ASC']] },
      { model: ActionFundingPosition, order: [['dueDate', 'ASC']] },
      { model: ActionEvidenceLink, order: [['createdAt', 'DESC']] },
    ],
  });
  if (!action) return null;
  const [decisions, risks, directDependencies, predecessorDependencies] = await Promise.all([
    StrategyDecision.findAll({ where: { organizationId, actionId }, include: [{ model: User, as: 'decisionOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['dueDate', 'ASC']] }),
    StrategyRiskIssue.findAll({ where: { organizationId, actionId }, include: [{ model: User, as: 'riskOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['dueDate', 'ASC']] }),
    ActionDependency.findAll({ where: { organizationId, dependentType: 'action', dependentId: actionId }, include: [{ model: User, as: 'dependencyOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['severity', 'DESC'], ['dueDate', 'ASC']] }),
    ActionDependency.findAll({ where: { organizationId, predecessorType: 'action', predecessorId: actionId }, include: [{ model: User, as: 'dependencyOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['severity', 'DESC'], ['dueDate', 'ASC']] }),
  ]);
  const dependencies = await resolveReferences(organizationId, [...directDependencies, ...predecessorDependencies]);
  return { ...plain(action), decisions: decisions.map(plain), risks: risks.map(plain), dependencies };
}
async function createDefaultPeriods({ organizationId, strategy }) {
  if (strategy.reportingCadence !== 'quarterly') return;
  const start = asDate(strategy.startDate || todayIso()); const end = asDate(strategy.endDate || plusDays(strategy.startDate || todayIso(), 365));
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), Math.floor(start.getUTCMonth() / 3) * 3, 1));
  const limit = new Date(end.getTime()); let guard = 0;
  while (cursor <= limit && guard < 20) {
    const { financialYear, quarter } = fiscalQuarter(cursor.toISOString().slice(0, 10)); const { startsOn, endsOn } = quarterBounds(financialYear, quarter);
    await QuarterlyReportingPeriod.findOrCreate({ where: { strategyId: strategy.id, financialYear, quarter }, defaults: { organizationId, strategyId: strategy.id, financialYear, quarter, label: `${financialYear} ${quarter}`, startsOn, endsOn, updateDueOn: plusDays(endsOn, -10), status: startsOn <= todayIso() && endsOn >= todayIso() ? 'open' : 'preparing' } });
    cursor.setUTCMonth(cursor.getUTCMonth() + 3); guard += 1;
  }
}
async function reportPackage(organizationId, strategyId, reportingPeriodId = null) {
  const strategy = await StrategicPlan.findOne({ where: { organizationId, id: strategyId }, include: [{ model: StrategyFocusArea, where: { status: 'active' }, required: false, order: [['sortOrder', 'ASC']] }] });
  if (!strategy) return null;
  const period = reportingPeriodId ? await QuarterlyReportingPeriod.findOne({ where: { organizationId, strategyId, id: reportingPeriodId } }) : await QuarterlyReportingPeriod.findOne({ where: { organizationId, strategyId, status: 'open' }, order: [['endsOn', 'DESC']] }) || await QuarterlyReportingPeriod.findOne({ where: { organizationId, strategyId }, order: [['endsOn', 'DESC']] });
  const [statuses, actions, dependencies, milestones, decisions, updates, risks, measures, funding] = await Promise.all([
    StrategyStatusDefinition.findAll({ where: { organizationId, strategyId, isActive: true }, order: [['sortOrder', 'ASC']] }),
    StrategyAction.findAll({ where: { organizationId, strategyId, isActive: true }, include: [{ model: StrategyFocusArea, attributes: ['id', 'code', 'title'] }, { model: User, as: 'actionOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['reportingPriority', 'DESC'], ['targetDate', 'ASC']] }),
    ActionDependency.findAll({ where: { organizationId, strategyId, status: { [Op.in]: ['open', 'progressing'] } }, include: [{ model: User, as: 'dependencyOwner', attributes: ['id', 'firstName', 'lastName'] }] }),
    ActionMilestone.findAll({ where: { organizationId, status: { [Op.ne]: 'complete' } }, include: [{ model: StrategyAction, where: { strategyId }, attributes: ['id', 'title', 'actionCode'] }] }),
    StrategyDecision.findAll({ where: { organizationId, strategyId, decisionStatus: { [Op.in]: ['required', 'draft', 'deferred'] } }, include: [{ model: StrategyAction, attributes: ['id', 'title', 'actionCode'] }, { model: User, as: 'decisionOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['dueDate', 'ASC']] }),
    period ? QuarterlyActionUpdate.findAll({ where: { organizationId, reportingPeriodId: period.id }, include: [{ model: StrategyAction, attributes: ['id', 'title', 'actionCode'] }] }) : [],
    StrategyRiskIssue.findAll({ where: { organizationId, strategyId, status: { [Op.notIn]: ['resolved', 'accepted'] } }, include: [{ model: StrategyAction, attributes: ['id', 'title', 'actionCode'] }], order: [['impact', 'DESC'], ['likelihood', 'DESC']] }),
    StrategyMeasure.findAll({ where: { organizationId }, include: [{ model: StrategyAction, where: { strategyId }, attributes: ['id', 'title', 'actionCode'] }] }),
    ActionFundingPosition.findAll({ where: { organizationId }, include: [{ model: StrategyAction, where: { strategyId }, attributes: ['id', 'title', 'actionCode'] }] }),
  ]);
  const statusByCode = Object.fromEntries(statuses.map((item) => [item.code, plain(item)]));
  const actionRows = actions.map(plain);
  const statusMix = statuses.map((status) => ({ code: status.code, label: status.label, category: status.category, color: status.color, count: actionRows.filter((action) => action.status === status.code).length }));
  const focusSummary = (strategy.StrategyFocusAreas || []).map((focus) => ({ id: focus.id, title: focus.title, actions: actionRows.filter((action) => action.focusAreaId === focus.id).length, onTrack: actionRows.filter((action) => action.focusAreaId === focus.id && statusByCode[action.status]?.category === 'on_track').length, attention: actionRows.filter((action) => action.focusAreaId === focus.id && ['attention', 'off_track'].includes(statusByCode[action.status]?.category)).length }));
  const overdueMilestones = milestones.filter((item) => item.dueDate && item.dueDate < todayIso()).map(plain);
  const criticalDependencies = (await resolveReferences(organizationId, dependencies.filter((item) => item.severity === 'critical')));
  const unresolvedDecisions = decisions.map(plain);
  const currentUpdates = updates.map(plain);
  const updateCoverage = actionRows.length ? Math.round((currentUpdates.length / actionRows.length) * 100) : 0;
  const evidenceCoverage = actionRows.length ? Math.round((actionRows.filter((action) => action.readinessScore > 0).length / actionRows.length) * 100) : 0;
  const fundingTotal = funding.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const summary = {
    totalActions: actionRows.length, onTrack: statusMix.find((item) => item.category === 'on_track')?.count || 0, attentionRequired: statusMix.filter((item) => ['attention', 'off_track'].includes(item.category)).reduce((sum, item) => sum + item.count, 0), completed: statusMix.find((item) => item.category === 'complete')?.count || 0, criticalDependencies: criticalDependencies.length, overdueMilestones: overdueMilestones.length, decisionsRequired: unresolvedDecisions.length, updateCoverage, evidenceCoverage, fundingTotal,
  };
  const narrative = `This review covers ${summary.totalActions} active actions${period ? ` for ${period.label}` : ''}. ${summary.onTrack} are on track, ${summary.attentionRequired} require attention and ${summary.completed} are complete. ${summary.criticalDependencies ? `${summary.criticalDependencies} critical dependencies require active resolution. ` : ''}${summary.decisionsRequired ? `${summary.decisionsRequired} decision items should be considered in the next leadership discussion. ` : ''}${summary.overdueMilestones ? `${summary.overdueMilestones} milestones are overdue. ` : ''}This is a data-led draft for officer review; it does not infer outcomes or make claims beyond the recorded evidence.`;
  return { strategy: plain(strategy), reportingPeriod: plain(period), summary, statusMix, focusSummary, actions: actionRows, dependencies: await resolveReferences(organizationId, dependencies), criticalDependencies, overdueMilestones, decisions: unresolvedDecisions, updates: currentUpdates, risks: risks.map(plain), measures: measures.map(plain), funding: funding.map(plain), narrative };
}

export async function listStrategyWorkspace(req, res, next) {
  try {
    const { organizationId } = req.tenant; const requestedId = req.query.strategyId;
    const strategies = await StrategicPlan.findAll({ where: { organizationId }, order: [['status', 'ASC'], ['updatedAt', 'DESC']] });
    const strategy = requestedId ? strategies.find((item) => item.id === requestedId) : strategies.find((item) => item.status === 'active') || strategies[0];
    if (!strategy) return res.json({ data: { strategies: [], selectedStrategy: null, focusAreas: [], statuses: [], actions: [], reportingPeriods: [], alerts: [], teamMembers: [] } });
    await ensureDefaults(organizationId, strategy.id);
    const [focusAreas, statuses, actions, periods, alerts, teamMembers, report] = await Promise.all([
      StrategyFocusArea.findAll({ where: { organizationId, strategyId: strategy.id, status: 'active' }, order: [['sortOrder', 'ASC']] }),
      StrategyStatusDefinition.findAll({ where: { organizationId, strategyId: strategy.id, isActive: true }, order: [['sortOrder', 'ASC']] }),
      StrategyAction.findAll({ where: { organizationId, strategyId: strategy.id, isActive: true }, include: [{ model: StrategyFocusArea, attributes: ['id', 'code', 'title'] }, { model: User, as: 'actionOwner', attributes: ['id', 'firstName', 'lastName', 'role'] }, { model: CivicProject, as: 'linkedProjects', attributes: ['id', 'name', 'stage'], through: { attributes: ['relationshipType'] } }], order: [['reportingPriority', 'DESC'], ['targetDate', 'ASC']] }),
      QuarterlyReportingPeriod.findAll({ where: { organizationId, strategyId: strategy.id }, order: [['endsOn', 'DESC']] }),
      StrategyAlert.findAll({ where: { organizationId, strategyId: strategy.id, status: 'open' }, include: [{ model: StrategyAction, attributes: ['id', 'title', 'actionCode'] }], order: [['severity', 'DESC'], ['dueDate', 'ASC']], limit: 20 }),
      User.findAll({ where: { organizationId, status: 'active' }, attributes: ['id', 'firstName', 'lastName', 'role'], order: [['firstName', 'ASC']] }),
      reportPackage(organizationId, strategy.id),
    ]);
    return res.json({ data: { strategies: strategies.map(plain), selectedStrategy: plain(strategy), focusAreas: focusAreas.map(plain), statuses: statuses.map(plain), actions: actions.map(plain), reportingPeriods: periods.map(plain), alerts: alerts.map(plain), teamMembers: teamMembers.map(plain), report } });
  } catch (error) { return next(error); }
}

export async function createStrategy(req, res, next) {
  try {
    const value = validation(strategySchema, req.body, res); if (!value) return;
    if (!await ownerExists(req.tenant.organizationId, value.ownerId)) return res.status(422).json({ error: 'The nominated strategy owner is not active in this council.' });
    const strategy = await StrategicPlan.create({ ...value, organizationId: req.tenant.organizationId });
    await ensureDefaults(req.tenant.organizationId, strategy.id);
    await createDefaultPeriods({ organizationId: req.tenant.organizationId, strategy });
    await recordAudit(req, { entityType: 'strategic_plan', entityId: strategy.id, action: 'created', metadata: { name: strategy.name } });
    return res.status(201).json({ data: strategy });
  } catch (error) { return next(error); }
}

export async function updateStrategy(req, res, next) {
  try {
    const strategy = await ensureStrategy(req, req.params.strategyId); if (!strategy) return res.status(404).json({ error: 'Strategy not found.' });
    const value = validation(strategySchema, req.body, res, { partial: true }); if (!value) return;
    if (value.ownerId && !await ownerExists(req.tenant.organizationId, value.ownerId)) return res.status(422).json({ error: 'The nominated strategy owner is not active in this council.' });
    await strategy.update(value); await recordAudit(req, { entityType: 'strategic_plan', entityId: strategy.id, action: 'updated', metadata: Object.keys(value) });
    return res.json({ data: strategy });
  } catch (error) { return next(error); }
}

export async function createFocusArea(req, res, next) {
  try {
    const strategy = await ensureStrategy(req, req.params.strategyId); if (!strategy) return res.status(404).json({ error: 'Strategy not found.' });
    const value = validation(focusSchema, req.body, res); if (!value) return;
    const focus = await StrategyFocusArea.create({ ...value, organizationId: req.tenant.organizationId, strategyId: strategy.id });
    await recordAudit(req, { entityType: 'strategy_focus_area', entityId: focus.id, action: 'created', metadata: { strategyId: strategy.id } });
    return res.status(201).json({ data: focus });
  } catch (error) { return next(error); }
}

export async function createStrategyAction(req, res, next) {
  try {
    const strategy = await ensureStrategy(req, req.params.strategyId); if (!strategy) return res.status(404).json({ error: 'Strategy not found.' });
    const value = validation(actionSchema, req.body, res); if (!value) return;
    if (value.focusAreaId && !await StrategyFocusArea.findOne({ where: { id: value.focusAreaId, organizationId: req.tenant.organizationId, strategyId: strategy.id, status: 'active' } })) return res.status(422).json({ error: 'The selected focus area is not available for this strategy.' });
    if (value.ownerId && !await ownerExists(req.tenant.organizationId, value.ownerId)) return res.status(422).json({ error: 'The nominated action owner is not active in this council.' });
    const action = await StrategyAction.create({ ...value, organizationId: req.tenant.organizationId, strategyId: strategy.id });
    await recordAudit(req, { entityType: 'strategy_action', entityId: action.id, action: 'created', metadata: { strategyId: strategy.id, actionCode: action.actionCode } });
    return res.status(201).json({ data: await actionDetail(req.tenant.organizationId, action.id) });
  } catch (error) { return next(error); }
}

export async function getStrategyAction(req, res, next) {
  try { const data = await actionDetail(req.tenant.organizationId, req.params.actionId); if (!data) return res.status(404).json({ error: 'Strategy action not found.' }); return res.json({ data }); } catch (error) { return next(error); }
}

export async function updateStrategyAction(req, res, next) {
  try {
    const action = await ensureAction(req, req.params.actionId); if (!action) return res.status(404).json({ error: 'Strategy action not found.' });
    const value = validation(actionSchema, req.body, res, { partial: true }); if (!value) return;
    if (value.focusAreaId && !await StrategyFocusArea.findOne({ where: { id: value.focusAreaId, organizationId: req.tenant.organizationId, strategyId: action.strategyId, status: 'active' } })) return res.status(422).json({ error: 'The selected focus area is not available for this strategy.' });
    if (value.ownerId && !await ownerExists(req.tenant.organizationId, value.ownerId)) return res.status(422).json({ error: 'The nominated action owner is not active in this council.' });
    await action.update(value); await recordAudit(req, { entityType: 'strategy_action', entityId: action.id, action: 'updated', metadata: Object.keys(value) });
    return res.json({ data: await actionDetail(req.tenant.organizationId, action.id) });
  } catch (error) { return next(error); }
}

export async function linkActionProject(req, res, next) {
  try {
    const action = await ensureAction(req, req.params.actionId); if (!action) return res.status(404).json({ error: 'Strategy action not found.' });
    const schema = Joi.object({ projectId: Joi.string().uuid().required(), relationshipType: Joi.string().valid('primary_delivery', 'contributing', 'evidence', 'dependency').default('primary_delivery') });
    const value = validation(schema, req.body, res); if (!value) return;
    const project = await CivicProject.findOne({ where: { id: value.projectId, organizationId: req.tenant.organizationId } }); if (!project) return res.status(404).json({ error: 'Project not found.' });
    const [link] = await StrategyActionProject.findOrCreate({ where: { actionId: action.id, projectId: project.id }, defaults: { ...value, organizationId: req.tenant.organizationId, actionId: action.id, projectId: project.id } });
    await recordAudit(req, { entityType: 'strategy_action_project', entityId: link.id, action: 'linked', metadata: { actionId: action.id, projectId: project.id } });
    return res.status(201).json({ data: await actionDetail(req.tenant.organizationId, action.id) });
  } catch (error) { return next(error); }
}

export async function unlinkActionProject(req, res, next) {
  try {
    const action = await ensureAction(req, req.params.actionId); if (!action) return res.status(404).json({ error: 'Strategy action not found.' });
    await StrategyActionProject.destroy({ where: { organizationId: req.tenant.organizationId, actionId: action.id, projectId: req.params.projectId }, force: true });
    await recordAudit(req, { entityType: 'strategy_action_project', entityId: req.params.projectId, action: 'unlinked', metadata: { actionId: action.id } });
    return res.status(204).end();
  } catch (error) { return next(error); }
}

export async function createMilestone(req, res, next) {
  try { const action = await ensureAction(req, req.params.actionId); if (!action) return res.status(404).json({ error: 'Strategy action not found.' }); const value = validation(milestoneSchema, req.body, res); if (!value) return; if (value.ownerId && !await ownerExists(req.tenant.organizationId, value.ownerId)) return res.status(422).json({ error: 'The nominated milestone owner is not active in this council.' }); const record = await ActionMilestone.create({ ...value, organizationId: req.tenant.organizationId, actionId: action.id }); await recordAudit(req, { entityType: 'action_milestone', entityId: record.id, action: 'created', metadata: { actionId: action.id } }); return res.status(201).json({ data: record }); } catch (error) { return next(error); }
}
export async function updateMilestone(req, res, next) {
  try { const record = await ActionMilestone.findOne({ where: { id: req.params.milestoneId, organizationId: req.tenant.organizationId } }); if (!record) return res.status(404).json({ error: 'Milestone not found.' }); const value = validation(milestoneSchema, req.body, res, { partial: true }); if (!value) return; if (value.ownerId && !await ownerExists(req.tenant.organizationId, value.ownerId)) return res.status(422).json({ error: 'The nominated milestone owner is not active in this council.' }); await record.update(value); await recordAudit(req, { entityType: 'action_milestone', entityId: record.id, action: 'updated', metadata: Object.keys(value) }); return res.json({ data: record }); } catch (error) { return next(error); }
}

export async function createDependency(req, res, next) {
  try {
    const strategy = await ensureStrategy(req, req.params.strategyId); if (!strategy) return res.status(404).json({ error: 'Strategy not found.' }); const value = validation(dependencySchema, req.body, res); if (!value) return;
    if (value.dependentType === value.predecessorType && value.dependentId === value.predecessorId) return res.status(422).json({ error: 'A record cannot depend on itself.' });
    const [dependent, predecessor, ownerValid] = await Promise.all([ensureReference(req, value.dependentType, value.dependentId, strategy.id), ensureReference(req, value.predecessorType, value.predecessorId, strategy.id), ownerExists(req.tenant.organizationId, value.ownerId)]);
    if (!dependent || !predecessor) return res.status(422).json({ error: 'Each side of a dependency must be an active record within this strategy workspace.' }); if (!ownerValid) return res.status(422).json({ error: 'The nominated dependency owner is not active in this council.' });
    const record = await ActionDependency.create({ ...value, organizationId: req.tenant.organizationId, strategyId: strategy.id }); await recordAudit(req, { entityType: 'action_dependency', entityId: record.id, action: 'created', metadata: { strategyId: strategy.id, severity: record.severity } });
    return res.status(201).json({ data: (await resolveReferences(req.tenant.organizationId, [record]))[0] });
  } catch (error) { return next(error); }
}
export async function updateDependency(req, res, next) {
  try { const record = await ActionDependency.findOne({ where: { id: req.params.dependencyId, organizationId: req.tenant.organizationId } }); if (!record) return res.status(404).json({ error: 'Dependency not found.' }); const value = validation(dependencySchema, req.body, res, { partial: true }); if (!value) return; if (value.ownerId && !await ownerExists(req.tenant.organizationId, value.ownerId)) return res.status(422).json({ error: 'The nominated dependency owner is not active in this council.' }); if (value.status === 'resolved' && !value.resolutionDate && !record.resolutionDate) value.resolutionDate = new Date(); await record.update(value); await recordAudit(req, { entityType: 'action_dependency', entityId: record.id, action: 'updated', metadata: Object.keys(value) }); return res.json({ data: (await resolveReferences(req.tenant.organizationId, [record]))[0] }); } catch (error) { return next(error); }
}

export async function createReportingPeriod(req, res, next) {
  try { const strategy = await ensureStrategy(req, req.params.strategyId); if (!strategy) return res.status(404).json({ error: 'Strategy not found.' }); const value = validation(periodSchema, req.body, res); if (!value) return; const record = await QuarterlyReportingPeriod.create({ ...value, organizationId: req.tenant.organizationId, strategyId: strategy.id }); await recordAudit(req, { entityType: 'quarterly_reporting_period', entityId: record.id, action: 'created', metadata: { strategyId: strategy.id, quarter: record.quarter } }); return res.status(201).json({ data: record }); } catch (error) { return next(error); }
}
export async function updateReportingPeriod(req, res, next) {
  try { const record = await QuarterlyReportingPeriod.findOne({ where: { id: req.params.periodId, organizationId: req.tenant.organizationId } }); if (!record) return res.status(404).json({ error: 'Reporting period not found.' }); const value = validation(periodSchema, req.body, res, { partial: true }); if (!value) return; if (value.status === 'finalised' && record.status !== 'finalised') { value.finalisedAt = new Date(); value.finalisedBy = req.auth.sub; } await record.update(value); await recordAudit(req, { entityType: 'quarterly_reporting_period', entityId: record.id, action: 'updated', metadata: Object.keys(value) }); return res.json({ data: record }); } catch (error) { return next(error); }
}
export async function createQuarterlyUpdate(req, res, next) {
  try { const period = await QuarterlyReportingPeriod.findOne({ where: { id: req.params.periodId, organizationId: req.tenant.organizationId } }); if (!period) return res.status(404).json({ error: 'Reporting period not found.' }); if (['locked', 'finalised'].includes(period.status)) return res.status(422).json({ error: 'This reporting period is locked. Reopen it before updating actions.' }); const value = validation(updateSchema, req.body, res); if (!value) return; const action = await StrategyAction.findOne({ where: { id: value.actionId, organizationId: req.tenant.organizationId, strategyId: period.strategyId } }); if (!action) return res.status(422).json({ error: 'The selected action does not belong to this reporting period’s strategy.' }); const [record, created] = await QuarterlyActionUpdate.findOrCreate({ where: { actionId: action.id, reportingPeriodId: period.id }, defaults: { ...value, organizationId: req.tenant.organizationId, reportingPeriodId: period.id, actionId: action.id, submittedBy: req.auth.sub } }); if (!created) await record.update({ ...value, submittedBy: req.auth.sub, submittedAt: new Date(), version: record.version + 1 }); await action.update({ status: value.status, statusRationale: value.riskSummary || action.statusRationale }); await recordAudit(req, { entityType: 'quarterly_action_update', entityId: record.id, action: created ? 'created' : 'updated', metadata: { actionId: action.id, periodId: period.id, movement: value.movement } }); return res.status(created ? 201 : 200).json({ data: record }); } catch (error) { return next(error); }
}

export async function createMeasure(req, res, next) {
  try { const action = await ensureAction(req, req.params.actionId); if (!action) return res.status(404).json({ error: 'Strategy action not found.' }); const value = validation(measureSchema, req.body, res); if (!value) return; const record = await StrategyMeasure.create({ ...value, organizationId: req.tenant.organizationId, actionId: action.id }); await recordAudit(req, { entityType: 'strategy_measure', entityId: record.id, action: 'created', metadata: { actionId: action.id } }); return res.status(201).json({ data: record }); } catch (error) { return next(error); }
}
export async function createDecision(req, res, next) {
  try { const strategy = await ensureStrategy(req, req.params.strategyId); if (!strategy) return res.status(404).json({ error: 'Strategy not found.' }); const value = validation(decisionSchema, req.body, res); if (!value) return; if (!value.actionId && !value.projectId) return res.status(422).json({ error: 'Link the decision to an action or project.' }); if (value.actionId && !await StrategyAction.findOne({ where: { id: value.actionId, organizationId: req.tenant.organizationId, strategyId: strategy.id } })) return res.status(422).json({ error: 'The selected action is not part of this strategy.' }); if (value.projectId && !await CivicProject.findOne({ where: { id: value.projectId, organizationId: req.tenant.organizationId } })) return res.status(422).json({ error: 'The selected project is not available in this council.' }); if (value.ownerId && !await ownerExists(req.tenant.organizationId, value.ownerId)) return res.status(422).json({ error: 'The nominated decision owner is not active in this council.' }); const record = await StrategyDecision.create({ ...value, organizationId: req.tenant.organizationId, strategyId: strategy.id }); await recordAudit(req, { entityType: 'strategy_decision', entityId: record.id, action: 'created', metadata: { strategyId: strategy.id, decisionStatus: record.decisionStatus } }); return res.status(201).json({ data: record }); } catch (error) { return next(error); }
}
export async function createStakeholder(req, res, next) {
  try { const action = await ensureAction(req, req.params.actionId); if (!action) return res.status(404).json({ error: 'Strategy action not found.' }); const value = validation(stakeholderSchema, req.body, res); if (!value) return; if (value.ownerId && !await ownerExists(req.tenant.organizationId, value.ownerId)) return res.status(422).json({ error: 'The nominated stakeholder owner is not active in this council.' }); const record = await StrategyStakeholder.create({ ...value, organizationId: req.tenant.organizationId, actionId: action.id }); await recordAudit(req, { entityType: 'strategy_stakeholder', entityId: record.id, action: 'created', metadata: { actionId: action.id } }); return res.status(201).json({ data: record }); } catch (error) { return next(error); }
}
export async function createRiskIssue(req, res, next) {
  try { const strategy = await ensureStrategy(req, req.params.strategyId); if (!strategy) return res.status(404).json({ error: 'Strategy not found.' }); const value = validation(riskSchema, req.body, res); if (!value) return; if (value.actionId && !await StrategyAction.findOne({ where: { id: value.actionId, organizationId: req.tenant.organizationId, strategyId: strategy.id } })) return res.status(422).json({ error: 'The selected action is not part of this strategy.' }); if (value.dependencyId && !await ActionDependency.findOne({ where: { id: value.dependencyId, organizationId: req.tenant.organizationId, strategyId: strategy.id } })) return res.status(422).json({ error: 'The selected dependency is not part of this strategy.' }); if (value.ownerId && !await ownerExists(req.tenant.organizationId, value.ownerId)) return res.status(422).json({ error: 'The nominated risk owner is not active in this council.' }); const record = await StrategyRiskIssue.create({ ...value, organizationId: req.tenant.organizationId, strategyId: strategy.id }); await recordAudit(req, { entityType: 'strategy_risk_issue', entityId: record.id, action: 'created', metadata: { strategyId: strategy.id, issueType: record.issueType } }); return res.status(201).json({ data: record }); } catch (error) { return next(error); }
}
export async function createFundingPosition(req, res, next) {
  try { const action = await ensureAction(req, req.params.actionId); if (!action) return res.status(404).json({ error: 'Strategy action not found.' }); const value = validation(fundingSchema, req.body, res); if (!value) return; const record = await ActionFundingPosition.create({ ...value, organizationId: req.tenant.organizationId, actionId: action.id }); await recordAudit(req, { entityType: 'action_funding_position', entityId: record.id, action: 'created', metadata: { actionId: action.id } }); return res.status(201).json({ data: record }); } catch (error) { return next(error); }
}
export async function createEvidenceLink(req, res, next) {
  try { const action = await ensureAction(req, req.params.actionId); if (!action) return res.status(404).json({ error: 'Strategy action not found.' }); const value = validation(evidenceSchema, req.body, res); if (!value) return; const record = await ActionEvidenceLink.create({ ...value, organizationId: req.tenant.organizationId, actionId: action.id }); await recordAudit(req, { entityType: 'action_evidence', entityId: record.id, action: 'created', metadata: { actionId: action.id } }); return res.status(201).json({ data: record }); } catch (error) { return next(error); }
}

export async function getQuarterlyReport(req, res, next) {
  try { const period = await QuarterlyReportingPeriod.findOne({ where: { id: req.params.periodId, organizationId: req.tenant.organizationId } }); if (!period) return res.status(404).json({ error: 'Reporting period not found.' }); const data = await reportPackage(req.tenant.organizationId, period.strategyId, period.id); return res.json({ data }); } catch (error) { return next(error); }
}
export async function createReportSnapshot(req, res, next) {
  try { const period = await QuarterlyReportingPeriod.findOne({ where: { id: req.params.periodId, organizationId: req.tenant.organizationId } }); if (!period) return res.status(404).json({ error: 'Reporting period not found.' }); const value = validation(reportSchema, req.body, res); if (!value) return; const packageData = await reportPackage(req.tenant.organizationId, period.strategyId, period.id); const version = (await StrategyReportSnapshot.count({ where: { organizationId: req.tenant.organizationId, strategyId: period.strategyId, reportingPeriodId: period.id, reportType: 'quarterly' } })) + 1; const record = await StrategyReportSnapshot.create({ organizationId: req.tenant.organizationId, strategyId: period.strategyId, reportingPeriodId: period.id, preparedBy: req.auth.sub, reportType: 'quarterly', version, status: value.status, content: packageData, narrative: value.narrative || packageData.narrative }); await recordAudit(req, { entityType: 'strategy_report_snapshot', entityId: record.id, action: 'created', metadata: { periodId: period.id, version } }); return res.status(201).json({ data: record }); } catch (error) { return next(error); }
}
export async function listAlerts(req, res, next) {
  try { const strategy = await ensureStrategy(req, req.params.strategyId); if (!strategy) return res.status(404).json({ error: 'Strategy not found.' }); const data = await StrategyAlert.findAll({ where: { organizationId: req.tenant.organizationId, strategyId: strategy.id, ...(req.query.status ? { status: req.query.status } : {}) }, include: [{ model: StrategyAction, attributes: ['id', 'actionCode', 'title'] }, { model: User, as: 'alertOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['severity', 'DESC'], ['dueDate', 'ASC']] }); return res.json({ data }); } catch (error) { return next(error); }
}
export async function updateAlert(req, res, next) {
  try { const alert = await StrategyAlert.findOne({ where: { id: req.params.alertId, organizationId: req.tenant.organizationId } }); if (!alert) return res.status(404).json({ error: 'Alert not found.' }); const schema = Joi.object({ status: Joi.string().valid('open', 'dismissed', 'resolved').required(), ownerId: Joi.string().uuid().allow(null) }); const value = validation(schema, req.body, res); if (!value) return; if (value.ownerId && !await ownerExists(req.tenant.organizationId, value.ownerId)) return res.status(422).json({ error: 'The nominated alert owner is not active in this council.' }); await alert.update({ ...value, resolvedAt: value.status === 'resolved' ? new Date() : null }); await recordAudit(req, { entityType: 'strategy_alert', entityId: alert.id, action: 'updated', metadata: value }); return res.json({ data: alert }); } catch (error) { return next(error); }
}

export async function previewStrategyImport(req, res, next) {
  try { const strategy = await ensureStrategy(req, req.params.strategyId); if (!strategy) return res.status(404).json({ error: 'Strategy not found.' }); const value = validation(importSchema, req.body, res); if (!value) return; const { headers, rows } = parseCsv(value.csv); const required = ['title']; const missing = required.filter((header) => !headers.includes(header)); if (!rows.length || missing.length) return res.status(422).json({ error: missing.length ? `Missing required column: ${missing.join(', ')}` : 'The file needs a header row and at least one action row.' }); return res.json({ data: { headers, rowCount: rows.length, preview: rows.slice(0, 12), rows, acceptedColumns: ['action_code', 'title', 'description', 'focus_area', 'owner_email', 'delivery_pathway', 'status', 'target_date', 'next_step', 'next_decision', 'readiness_score', 'budget_status'] } }); } catch (error) { return next(error); }
}
export async function commitStrategyImport(req, res, next) {
  try {
    const strategy = await ensureStrategy(req, req.params.strategyId); if (!strategy) return res.status(404).json({ error: 'Strategy not found.' }); const schema = Joi.object({ rows: Joi.array().min(1).max(1000).required() }); const value = validation(schema, req.body, res); if (!value) return; const organizationId = req.tenant.organizationId; const [focusAreas, statusDefinitions, existingActions] = await Promise.all([StrategyFocusArea.findAll({ where: { organizationId, strategyId: strategy.id, status: 'active' } }), StrategyStatusDefinition.findAll({ where: { organizationId, strategyId: strategy.id, isActive: true }, attributes: ['code'] }), StrategyAction.findAll({ where: { organizationId, strategyId: strategy.id }, attributes: ['actionCode'] })]); const allowedStatusCodes = new Set(statusDefinitions.map((item) => item.code)); const actionCodes = new Set(existingActions.map((item) => item.actionCode).filter(Boolean)); let created = 0; const skipped = [];
    for (const [index, row] of value.rows.entries()) {
      if (!row.title) { skipped.push({ row: index + 2, reason: 'A title is required.' }); continue; }
      const actionCode = String(row.action_code || '').trim() || null;
      if (actionCode && actionCodes.has(actionCode)) { skipped.push({ row: index + 2, reason: `The action code “${actionCode}” already exists in this strategy.` }); continue; }
      const status = String(row.status || 'not_started').trim() || 'not_started';
      if (!allowedStatusCodes.has(status)) { skipped.push({ row: index + 2, reason: `“${status}” is not a governed action status for this strategy.` }); continue; }
      const focus = row.focus_area ? focusAreas.find((item) => item.title.toLowerCase() === String(row.focus_area).toLowerCase() || item.code.toLowerCase() === String(row.focus_area).toLowerCase()) : null;
      let ownerId = null; if (row.owner_email) { const owner = await User.findOne({ where: { organizationId, email: String(row.owner_email).toLowerCase(), status: 'active' } }); ownerId = owner?.id || null; }
      await StrategyAction.create({ organizationId, strategyId: strategy.id, focusAreaId: focus?.id || null, ownerId, actionCode, title: row.title, description: row.description || null, deliveryPathway: ['operational', 'capital', 'partnership', 'advocacy', 'policy', 'program', 'other'].includes(row.delivery_pathway) ? row.delivery_pathway : 'operational', status, targetDate: row.target_date || null, nextStep: row.next_step || null, nextDecision: row.next_decision || null, readinessScore: Math.max(0, Math.min(100, Number(row.readiness_score) || 0)), budgetStatus: ['not_costed', 'indicative', 'approved', 'funded', 'not_required'].includes(row.budget_status) ? row.budget_status : 'not_costed' }); if (actionCode) actionCodes.add(actionCode); created += 1;
    }
    await recordAudit(req, { entityType: 'strategy_action_import', entityId: strategy.id, action: 'committed', metadata: { created, skipped: skipped.length } }); return res.status(201).json({ data: { created, skipped, note: 'Imported actions are stored only in the active council workspace. Review action ownership, status and dates before using them in a quarterly report.' } });
  } catch (error) { return next(error); }
}

export { reportPackage };
