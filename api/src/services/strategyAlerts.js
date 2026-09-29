import { Op } from 'sequelize';
import {
  ActionDependency,
  ActionMilestone,
  QuarterlyActionUpdate,
  QuarterlyReportingPeriod,
  StrategyAction,
  StrategyAlert,
  StrategyDecision,
  StrategyMeasure,
} from '../models/index.js';

const isoToday = () => new Date().toISOString().slice(0, 10);
const asDate = (value) => value ? new Date(`${value}T00:00:00Z`) : null;
const nextMeasureDue = (measure) => {
  const start = asDate(measure.lastMeasuredAt) || asDate(measure.createdAt) || new Date();
  const months = { monthly: 1, quarterly: 3, half_yearly: 6, annual: 12 }[measure.reportingFrequency];
  if (!months) return null;
  const date = new Date(start.getTime());
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
};

async function upsertAlert({ organizationId, strategyId, actionId = null, dependencyId = null, reportingPeriodId = null, ownerId = null, alertType, severity, title, detail, dueDate, dedupeKey }) {
  const [alert, created] = await StrategyAlert.findOrCreate({
    where: { dedupeKey },
    defaults: { organizationId, strategyId, actionId, dependencyId, reportingPeriodId, ownerId, alertType, severity, title, detail, dueDate, dedupeKey, status: 'open', firstDetectedAt: new Date(), lastDetectedAt: new Date() },
  });
  if (!created && alert.status === 'open') await alert.update({ actionId, dependencyId, reportingPeriodId, ownerId, severity, title, detail, dueDate, lastDetectedAt: new Date() });
  return { created, alert };
}

async function resolveNoLongerActiveAlerts(organizationId, activeKeys) {
  const openAlerts = await StrategyAlert.findAll({ where: { organizationId, status: 'open' } });
  const stale = openAlerts.filter((item) => !activeKeys.has(item.dedupeKey));
  if (stale.length) await StrategyAlert.update({ status: 'resolved', resolvedAt: new Date() }, { where: { id: stale.map((item) => item.id) } });
  return stale.length;
}

export async function evaluateStrategyAlerts({ organizationId = null } = {}) {
  const today = isoToday();
  const scope = organizationId ? { organizationId } : {};
  const [dependencies, milestones, periods, decisions, measures] = await Promise.all([
    ActionDependency.findAll({ where: { ...scope, status: { [Op.in]: ['open', 'progressing'] }, severity: 'critical' } }),
    ActionMilestone.findAll({ where: { ...scope, status: { [Op.ne]: 'complete' }, dueDate: { [Op.lt]: today } }, include: [{ model: StrategyAction, attributes: ['id', 'strategyId', 'title'] }] }),
    QuarterlyReportingPeriod.findAll({ where: { ...scope, status: 'open', updateDueOn: { [Op.lte]: today } } }),
    StrategyDecision.findAll({ where: { ...scope, decisionStatus: { [Op.in]: ['required', 'draft', 'deferred'] }, dueDate: { [Op.lte]: today } } }),
    StrategyMeasure.findAll({ where: scope, include: [{ model: StrategyAction, attributes: ['id', 'strategyId', 'title', 'ownerId'] }] }),
  ]);
  const activeKeysByOrg = new Map(); const generated = [];
  const include = (organization, key) => { if (!activeKeysByOrg.has(organization)) activeKeysByOrg.set(organization, new Set()); activeKeysByOrg.get(organization).add(key); };
  const record = async (args) => { include(args.organizationId, args.dedupeKey); const result = await upsertAlert(args); generated.push(result); };

  for (const dependency of dependencies) {
    const type = !dependency.ownerId ? 'critical_dependency_unowned' : 'critical_dependency_overdue';
    const due = dependency.dueDate || dependency.escalationAt?.toISOString?.().slice(0, 10) || null;
    if (!dependency.ownerId || (due && due <= today)) {
      await record({ organizationId: dependency.organizationId, strategyId: dependency.strategyId, dependencyId: dependency.id, ownerId: dependency.ownerId, alertType: type, severity: 'critical', title: !dependency.ownerId ? 'Critical dependency has no owner' : 'Critical dependency is due for escalation', detail: dependency.detail || 'Assign an owner and record the active resolution path before the next reporting review.', dueDate: due, dedupeKey: `${type}:${dependency.id}` });
    }
  }
  for (const milestone of milestones) {
    const action = milestone.StrategyAction;
    if (!action) continue;
    await record({ organizationId: milestone.organizationId, strategyId: action.strategyId, actionId: action.id, ownerId: milestone.ownerId, alertType: 'milestone_overdue', severity: 'attention', title: `Milestone overdue: ${milestone.title}`, detail: `The milestone for ${action.title} is past its due date. Record progress, a revised date or a variance explanation.`, dueDate: milestone.dueDate, dedupeKey: `milestone_overdue:${milestone.id}` });
  }
  for (const period of periods) {
    const actions = await StrategyAction.findAll({ where: { organizationId: period.organizationId, strategyId: period.strategyId, isActive: true }, attributes: ['id', 'title', 'ownerId'] });
    const submitted = await QuarterlyActionUpdate.findAll({ where: { organizationId: period.organizationId, reportingPeriodId: period.id }, attributes: ['actionId'] });
    const submittedIds = new Set(submitted.map((item) => item.actionId));
    for (const action of actions.filter((item) => !submittedIds.has(item.id))) {
      await record({ organizationId: period.organizationId, strategyId: period.strategyId, reportingPeriodId: period.id, actionId: action.id, ownerId: action.ownerId, alertType: 'quarterly_update_missing', severity: 'attention', title: `Quarterly update missing: ${action.title}`, detail: `An update is due for ${period.label}. Capture the recorded movement, evidence, risks, decisions and next-quarter commitment.`, dueDate: period.updateDueOn, dedupeKey: `quarterly_update_missing:${period.id}:${action.id}` });
    }
  }
  for (const decision of decisions) {
    await record({ organizationId: decision.organizationId, strategyId: decision.strategyId, actionId: decision.actionId, ownerId: decision.ownerId, alertType: 'decision_due', severity: decision.decisionStatus === 'required' ? 'critical' : 'attention', title: `Decision due: ${decision.title}`, detail: decision.recommendation || 'Prepare the decision record and confirm the accountable decision-maker.', dueDate: decision.dueDate, dedupeKey: `decision_due:${decision.id}` });
  }
  for (const measure of measures) {
    const due = nextMeasureDue(measure); const action = measure.StrategyAction;
    if (due && due <= today && action) await record({ organizationId: measure.organizationId, strategyId: action.strategyId, actionId: action.id, ownerId: action.ownerId, alertType: 'measure_update_due', severity: 'attention', title: `Measure update due: ${measure.name}`, detail: `Update the current value and evidence for ${action.title}.`, dueDate: due, dedupeKey: `measure_update_due:${measure.id}:${due}` });
  }
  let resolved = 0;
  if (organizationId) resolved = await resolveNoLongerActiveAlerts(organizationId, activeKeysByOrg.get(organizationId) || new Set());
  else for (const [org, keys] of activeKeysByOrg) resolved += await resolveNoLongerActiveAlerts(org, keys);
  return { generated: generated.length, created: generated.filter((item) => item.created).length, resolved };
}
