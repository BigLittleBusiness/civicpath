import { AsyncLocalStorage } from 'node:async_hooks';
import { Op, literal } from 'sequelize';
import { sequelize } from './config/database.js';
import { Organization, User, Priority, CivicProject, Grant, Subscription, CollaborationParticipant } from './models/index.js';
import { createJobHeartbeatRegistry, createHealthService, createMysqlReadinessProbe } from './services/healthService.js';
import { OrganizationNotificationPolicy } from './models/notificationReliability.js';
import { enqueueCollaborationReminders, dispatchReliableNotifications } from './services/notificationReliabilityService.js';

export const jobHeartbeats = createJobHeartbeatRegistry();
export const healthService = createHealthService({ databaseProbe: createMysqlReadinessProbe({ sequelize, timeoutMs: 1500, cacheMs: 1000 }), jobs: jobHeartbeats, requireJobs: process.env.NODE_ENV !== 'test' });
const activeReads = new AsyncLocalStorage();
const kinds = Object.freeze({ CivicProject: 'projects', WorkItem: 'work-items', EvidenceItem: 'evidence', StrategyAction: 'actions', ActionMilestone: 'milestones', StrategyMeasure: 'measures', ActionEvidenceLink: 'action-evidence', ActionFundingPosition: 'funding', StrategyStakeholder: 'stakeholders', StrategyRiskIssue: 'risks', StrategyDecision: 'decisions' });
const fundingKinds = Object.freeze({ Grant: 'grant', FundingPathway: 'pathway' });
const q = (name) => `\`${name}\``;
// Identifiers come only from the frozen model map, never HTTP input. The tenant
// is correlated to the outer row, so these predicates cannot cross tenants.
function ownArchiveSql(modelName, alias = modelName) {
  if (!kinds[modelName] && !fundingKinds[modelName]) return null;
  const a = q(alias);
  if (fundingKinds[modelName]) return `NOT EXISTS (SELECT 1 FROM \`funding_lifecycle_records\` AS cp_archive WHERE cp_archive.organization_id = ${a}.organization_id AND cp_archive.entity_type = '${fundingKinds[modelName]}' AND cp_archive.entity_id = ${a}.id AND cp_archive.archived_at IS NOT NULL)`;
  return `NOT EXISTS (SELECT 1 FROM \`RecordMaintenanceState\` AS cp_archive WHERE cp_archive.organization_id = ${a}.organization_id AND cp_archive.kind = '${kinds[modelName]}' AND cp_archive.record_id = ${a}.id AND cp_archive.archived_at IS NOT NULL)`;
}
function parentSql(modelName, alias = modelName) {
  const a = q(alias); const predicates = [];
  if (['WorkItem', 'EvidenceItem', 'FundingPathway', 'ReadinessAssessment', 'StrategyDecision', 'Grant'].includes(modelName)) predicates.push(`(${a}.project_id IS NULL OR EXISTS (SELECT 1 FROM \`CivicProject\` AS cp_parent WHERE cp_parent.id = ${a}.project_id AND cp_parent.organization_id = ${a}.organization_id AND cp_parent.deleted_at IS NULL AND ${ownArchiveSql('CivicProject', 'cp_parent')}))`);
  if (['WorkItem', 'EvidenceItem'].includes(modelName)) predicates.push(`(${a}.grant_id IS NULL OR EXISTS (SELECT 1 FROM \`Grant\` AS cp_parent WHERE cp_parent.id = ${a}.grant_id AND cp_parent.organization_id = ${a}.organization_id AND cp_parent.deleted_at IS NULL AND ${ownArchiveSql('Grant', 'cp_parent')}))`);
  if (['ActionMilestone', 'StrategyMeasure', 'ActionEvidenceLink', 'ActionFundingPosition', 'StrategyStakeholder', 'StrategyRiskIssue', 'StrategyDecision', 'QuarterlyActionUpdate', 'StrategyAlert'].includes(modelName)) predicates.push(`(${a}.action_id IS NULL OR EXISTS (SELECT 1 FROM \`StrategyAction\` AS cp_parent WHERE cp_parent.id = ${a}.action_id AND cp_parent.organization_id = ${a}.organization_id AND cp_parent.deleted_at IS NULL AND cp_parent.is_active = 1 AND ${ownArchiveSql('StrategyAction', 'cp_parent')}))`);
  if (modelName === 'ActionDependency') {
    for (const side of ['dependent', 'predecessor']) {
      for (const [type, parent] of [['action', 'StrategyAction'], ['project', 'CivicProject'], ['milestone', 'ActionMilestone']]) {
        predicates.push(`(${a}.${side}_type <> '${type}' OR EXISTS (SELECT 1 FROM ${q(parent)} AS cp_parent WHERE cp_parent.id = ${a}.${side}_id AND cp_parent.organization_id = ${a}.organization_id AND cp_parent.deleted_at IS NULL ${type === 'action' ? 'AND cp_parent.is_active = 1' : ''} AND ${ownArchiveSql(parent, 'cp_parent')}))`);
      }
    }
  }
  return predicates;
}
export function activeRecordWhere(modelName, where = {}, alias = modelName) {
  const predicates = [ownArchiveSql(modelName, alias), ...parentSql(modelName, alias)].filter(Boolean);
  return predicates.length ? { [Op.and]: [where, ...predicates.map(literal)] } : where;
}
export const ACTIVE_REGISTER_LIMIT = 5000;
export async function completeActiveRegister(model, options) {
  const rows = await withActiveRecords(() => model.findAll({ ...options, limit: ACTIVE_REGISTER_LIMIT + 1 }));
  if (rows.length > ACTIVE_REGISTER_LIMIT) throw integrationError(413, 'This register exceeds the safe complete-view limit. Contact support for a scoped export; no partial totals were returned.');
  return rows;
}
export const withActiveRecords = (work) => activeReads.run(true, work);
export function activeRecordsMiddleware(_req, _res, next) { return withActiveRecords(next); }
// Scoped hooks let the existing bounded report repository opt into archives
// without changing its owned service or hiding retained maintenance/recovery reads.
function filterIncludes(options, parentModel, parentAlias = '') {
  for (const include of options.include || []) {
    if (!include.model) continue;
    const association = typeof include.association === 'string' ? parentModel.associations[include.association] : include.association;
    const name = include.as || association?.as || Object.values(parentModel.associations || {}).find((a) => a.target === include.model)?.as || include.model.name;
    const alias = parentAlias ? `${parentAlias}->${name}` : name;
    const own = ownArchiveSql(include.model.name, alias);
    // Optional associations remain optional; original constrained joins remain required.
    if (own) {
      if (include.required === undefined) include.required = Boolean(include.where);
      include.where = { [Op.and]: [include.where || {}, literal(own)] };
    }
    filterIncludes(include, include.model, alias);
  }
}
const hooked = new Set();
export function installActiveReadHooks() {
  for (const model of Object.values(sequelize.models)) {
    if (hooked.has(model)) continue;
    hooked.add(model);
    const apply = (options) => {
      if (!activeReads.getStore()) return;
      options.where = activeRecordWhere(model.name, options.where, options.tableAs || model.name);
      // Sequelize root included aliases have no root prefix.
      filterIncludes(options, model);
    };
    model.addHook('beforeFind', 'backendActiveRecords', apply);
    model.addHook('beforeCount', 'backendActiveRecords', apply);
  }
}
export function integrationError(status, message) { return Object.assign(new Error(message), { status, integrationError: true }); }
export function handleIntegrationError(error, res, next) {
  if (error.integrationError) return res.status(error.status).json({ error: error.message });
  // Never send SQL, SDK responses or record contents to the shared error logger.
  return next(Object.assign(new Error('The workspace operation could not be completed. Please retry after checking service availability.'), { status: 503 }));
}
export async function assertCreateActor(req, transaction, roles = ['org_admin', 'portfolio_manager', 'contributor']) {
  if (!req.auth?.sub) throw integrationError(401, 'Authentication is required.');
  const organizationId = req.tenant?.organizationId;
  if (!organizationId || req.auth.organizationId !== organizationId) throw integrationError(403, 'Council workspace access is required.');
  // Lock order: organization -> actor -> referenced parents. Suspension locks the
  // same organization first, making the allowed state authoritative at commit.
  const options = { transaction, lock: transaction.LOCK.UPDATE };
  const organization = await Organization.findOne({ where: { id: organizationId }, ...options });
  if (!organization || !['trial', 'active'].includes(organization.status)) throw integrationError(403, 'Council workspace access is unavailable.');
  const actor = await User.findOne({ where: { id: req.auth.sub, organizationId, status: 'active' }, ...options });
  if (!actor || actor.role !== req.auth.role || actor.sessionVersion !== req.auth.sessionVersion || !roles.includes(actor.role)) throw integrationError(403, 'Your current role cannot change this record.');
  return { actor, organization };
}
export async function assertTenantReference(model, id, organizationId, transaction, { owner = false, where = {} } = {}) {
  if (!id) return null;
  const record = await withActiveRecords(() => model.findOne({ where: { organizationId, id, ...where, ...(owner ? { status: 'active', role: ['org_admin', 'portfolio_manager', 'contributor'] } : {}) }, transaction, lock: transaction.LOCK.UPDATE }));
  if (!record) throw integrationError(422, 'Choose an active record from this council workspace.');
  return record;
}
export async function validateCreateReferences(req, value, transaction) {
  const organizationId = req.tenant.organizationId;
  const project = await assertTenantReference(CivicProject, value.projectId, organizationId, transaction);
  const grant = await assertTenantReference(Grant, value.grantId, organizationId, transaction);
  await assertTenantReference(User, value.ownerId, organizationId, transaction, { owner: true });
  await assertTenantReference(Priority, value.priorityId, organizationId, transaction, { where: { status: 'active' } });
  if (project && grant?.projectId && grant.projectId !== project.id) throw integrationError(422, 'The grant and project must belong to the same delivery context.');
  if (req.auth.role === 'contributor') {
    if (value.ownerId && value.ownerId !== req.auth.sub) throw integrationError(403, 'Contributors cannot assign work to another owner.');
    const parent = project || grant;
    if (parent && parent.ownerId !== req.auth.sub) {
      const participant = project && await CollaborationParticipant.findOne({ where: { organizationId, resourceType: 'project', resourceId: project.id, userId: req.auth.sub, role: ['accountable', 'responsible', 'contributor'] }, transaction });
      if (!participant) throw integrationError(403, 'Only an owner or assigned contributor can add delivery records to this project or grant.');
    }
    if (value.isVerified === true) throw integrationError(403, 'Only a manager can verify evidence.');
  }
  return { project, grant };
}

export const SAFE_JOB_POLICY = Object.freeze({ tenantsPerCycle: 10, remindersPerTenant: 25, reminderPagesPerTenant: 2, dispatchLimit: 25 });
export function createSafeJobCycle({ selectTenants, reminders, dispatch, policy = SAFE_JOB_POLICY } = {}) {
  return async () => {
    const tenants = await selectTenants(policy.tenantsPerCycle);
    if (!Array.isArray(tenants) || tenants.length > policy.tenantsPerCycle || !tenants.every((id) => /^[0-9a-f-]{36}$/i.test(id))) throw new Error('Invalid safe job tenant selection');
    let scanned = 0;
    for (const organizationId of tenants) {
      let afterId = null;
      for (let page = 0; page < policy.reminderPagesPerTenant; page += 1) {
        const result = await reminders({ organizationId, limit: policy.remindersPerTenant, afterId });
        scanned += result.scanned; afterId = result.nextCursor;
        if (!afterId) break;
      }
    }
    // Empty approved scope remains a real, successful policy check, not delivery evidence.
    const outcomes = await dispatch({ organizationIds: tenants, limit: policy.dispatchLimit });
    if (outcomes.errors || outcomes.lostLease) throw new Error('Notification cycle persistence failed');
    return { scanned, ...outcomes };
  };
}
let tenantCursor = null;
export async function selectSafeNotificationTenants(limit) {
  const candidates = await OrganizationNotificationPolicy.findAll({ where: { [Op.or]: [{ digestsEnabled: true }, { remindersEnabled: true }], ...(tenantCursor ? { organizationId: { [Op.gt]: tenantCursor } } : {}) }, attributes: ['organizationId'], order: [['organizationId', 'ASC']], limit });
  tenantCursor = candidates.length === limit ? candidates.at(-1).organizationId : null;
  const ids = candidates.map((p) => p.organizationId);
  if (!ids.length) return [];
  const organizations = await Organization.findAll({ where: { id: ids, status: ['trial', 'active'] }, attributes: ['id'] });
  const subscriptions = await Subscription.findAll({ where: { organizationId: organizations.map((o) => o.id), status: 'active', [Op.or]: [{ endsAt: null }, { endsAt: { [Op.gt]: new Date() } }] }, attributes: ['organizationId'] });
  return [...new Set(subscriptions.map((s) => s.organizationId))];
}
export const runSafeNotificationCycle = createSafeJobCycle({
  selectTenants: selectSafeNotificationTenants,
  reminders: async (args) => {
    const policy = await OrganizationNotificationPolicy.findOne({ where: { organizationId: args.organizationId, remindersEnabled: true }, attributes: ['id'] });
    return policy ? enqueueCollaborationReminders(args) : { scanned: 0, created: 0, nextCursor: null };
  },
  dispatch: dispatchReliableNotifications,
});
// Install once, after the central and standalone models have been imported.
installActiveReadHooks();
