import { Op, Transaction } from 'sequelize';
import { sequelize } from '../config/database.js';
import { StrategicPlan, QuarterlyReportingPeriod, StrategyAction, StrategyStatusDefinition, StrategyFocusArea, QuarterlyActionUpdate, ActionEvidenceLink, ActionDependency, ActionMilestone, StrategyDecision, StrategyRiskIssue, StrategyMeasure, ActionFundingPosition, StrategyReportSnapshot, User } from '../models/index.js';
import { buildReport, plain, REPORT_ROW_LIMIT } from './reportMetrics.js';

const strategyFields = ['id', 'organizationId', 'name', 'reference', 'version', 'startDate', 'endDate', 'status'];
const periodFields = ['id', 'organizationId', 'strategyId', 'label', 'financialYear', 'quarter', 'startsOn', 'endsOn', 'status'];
const snapshotFields = ['id', 'strategyId', 'reportingPeriodId', 'reportType', 'version', 'status', 'createdAt'];
async function bounded(model, where, attributes, transaction, order = [['id', 'ASC']]) {
  const result = await model.findAll({ where, attributes, transaction, limit: REPORT_ROW_LIMIT + 1, order });
  if (result.length > REPORT_ROW_LIMIT) throw Object.assign(new Error(`Report source exceeds ${REPORT_ROW_LIMIT} rows in one section. Split the strategy or reduce the source register before reporting; no partial report was generated.`), { status: 422 });
  return result.map(plain);
}
export const reportRepository = {
  strategy: (organizationId, strategyId, transaction) => StrategicPlan.findOne({ where: { organizationId, id: strategyId }, attributes: strategyFields, transaction }).then((r) => r ? plain(r) : null),
  period: (organizationId, periodId, transaction, lock) => QuarterlyReportingPeriod.findOne({ where: { organizationId, id: periodId }, attributes: periodFields, transaction, ...(lock ? { lock: transaction.LOCK.UPDATE } : {}) }).then((r) => r ? plain(r) : null),
  strategies: (organizationId, limit, offset) => StrategicPlan.findAll({ where: { organizationId }, attributes: strategyFields, limit, offset, order: [['updatedAt', 'DESC'], ['id', 'DESC']], raw: true }),
  periods: (organizationId, strategyId, limit, offset) => QuarterlyReportingPeriod.findAll({ where: { organizationId, strategyId }, attributes: periodFields, limit, offset, order: [['endsOn', 'DESC'], ['id', 'DESC']], raw: true }),
  snapshots: (organizationId, period, limit, beforeVersion) => StrategyReportSnapshot.findAll({ where: { organizationId, strategyId: period.strategyId, reportingPeriodId: period.id, reportType: 'quarterly', ...(beforeVersion ? { version: { [Op.lt]: beforeVersion } } : {}) }, attributes: snapshotFields, limit, order: [['version', 'DESC'], ['createdAt', 'DESC'], ['id', 'DESC']], raw: true }),
  snapshot: (organizationId, snapshotId) => StrategyReportSnapshot.findOne({ where: { organizationId, id: snapshotId }, attributes: ['organizationId', ...snapshotFields, 'content'], raw: true }),
  // Include soft-deleted historic versions so a version number is never reused.
  maxVersion: (organizationId, period, transaction) => StrategyReportSnapshot.max('version', { where: { organizationId, strategyId: period.strategyId, reportingPeriodId: period.id, reportType: 'quarterly' }, paranoid: false, transaction }),
  createSnapshot: (values, transaction) => StrategyReportSnapshot.create(values, { transaction }),
  async report(organizationId, { strategy, period }, transaction) {
    const strategyId = strategy.id;
    const actions = await bounded(StrategyAction, { organizationId, strategyId, isActive: true }, ['id', 'organizationId', 'strategyId', 'focusAreaId', 'actionCode', 'title', 'status', 'targetDate', 'nextStep', 'nextDecision', 'nextDecisionDueAt', 'reportingPriority', 'isActive'], transaction);
    const actionIds = actions.map((a) => a.id);
    const related = { organizationId, actionId: { [Op.in]: actionIds } };
    const actionRows = (model, attrs, where = related) => actionIds.length ? bounded(model, where, ['organizationId', ...attrs], transaction) : Promise.resolve([]);
    const [statuses, focusAreas, updates, evidence, dependencies, milestones, decisions, risks, measures, funding] = await Promise.all([
      bounded(StrategyStatusDefinition, { organizationId, strategyId, isActive: true }, ['organizationId', 'strategyId', 'code', 'label', 'category', 'isActive'], transaction, [['sortOrder', 'ASC'], ['id', 'ASC']]),
      bounded(StrategyFocusArea, { organizationId, strategyId, status: 'active' }, ['id', 'organizationId', 'strategyId', 'code', 'title'], transaction, [['sortOrder', 'ASC'], ['id', 'ASC']]),
      actionRows(QuarterlyActionUpdate, ['id', 'actionId', 'reportingPeriodId', 'status', 'movement', 'workflowStatus', 'achievements', 'evidenceSummary', 'riskSummary', 'decisionsRequired', 'nextQuarterCommitments', 'submittedAt'], { ...related, reportingPeriodId: period.id }),
      actionRows(ActionEvidenceLink, ['id', 'actionId', 'title', 'evidenceType', 'source', 'createdAt']),
      bounded(ActionDependency, { organizationId, strategyId, status: { [Op.in]: ['open', 'progressing'] } }, ['id', 'organizationId', 'strategyId', 'dependencyType', 'severity', 'status', 'dueDate', 'detail'], transaction),
      actionRows(ActionMilestone, ['id', 'actionId', 'title', 'dueDate', 'status', 'varianceExplanation'], { ...related, status: { [Op.ne]: 'complete' } }),
      bounded(StrategyDecision, { organizationId, strategyId, decisionStatus: { [Op.in]: ['draft', 'required', 'deferred'] } }, ['id', 'organizationId', 'strategyId', 'actionId', 'title', 'decisionStatus', 'dueDate', 'recommendation'], transaction),
      bounded(StrategyRiskIssue, { organizationId, strategyId, status: { [Op.notIn]: ['resolved', 'accepted'] } }, ['id', 'organizationId', 'strategyId', 'actionId', 'title', 'issueType', 'status', 'impact', 'likelihood', 'mitigation', 'dueDate'], transaction),
      actionRows(StrategyMeasure, ['id', 'actionId', 'name', 'unit', 'baselineValue', 'targetValue', 'currentValue', 'lastMeasuredAt']),
      actionRows(ActionFundingPosition, ['id', 'actionId', 'sourceName', 'sourceType', 'amount', 'currencyCode', 'status', 'dueDate']),
    ]);
    return buildReport({ organizationId, strategy, period, actions, statuses, focusAreas, updates, evidence, dependencies, milestones, decisions, risks, measures, funding });
  },
};
export const reportTransaction = (fn) => sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ }, fn);
export const authorizeReportActor = (req) => User.findOne({ where: { id: req.auth.sub, organizationId: req.tenant.organizationId, status: 'active' }, attributes: ['id', 'organizationId', 'role', 'status'], raw: true });
