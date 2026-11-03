// Dependency-free policy/service: database and audit dependencies are injected for tests.
export class MaintenanceError extends Error {
  constructor(status, message, code = 'maintenance_rejected') { super(message); this.status = status; this.code = code; }
}
const fail = (status, message, code) => { throw new MaintenanceError(status, message, code); };
const text = (max, nullable = true) => ({ type: 'text', max, nullable });
const choice = (...options) => ({ type: 'select', options, nullable: false });
const ref = (reference, nullable = true) => ({ type: 'reference', reference, nullable });
const date = { type: 'date', nullable: true };
const timestamp = { type: 'datetime-local', nullable: true };
const money = { type: 'number', min: 0, max: 999999999999.99, decimals: 2, nullable: true };
const integer = (min, max, nullable = true) => ({ type: 'number', min, max, decimals: 0, nullable });
const boolean = { type: 'checkbox', nullable: false };
const deliveryStatus = choice('not_started', 'in_progress', 'blocked', 'complete');
const evidenceFields = { title: text(240, false), evidenceType: choice('document', 'metric', 'decision_record', 'link', 'other'), externalUrl: { type: 'url', max: 1000, nullable: true }, source: text(240), isVerified: boolean };
export const MAINTENANCE_KINDS = {
  projects: { model: 'CivicProject', label: 'Project', resource: 'project', configOnly: true, fields: {
    name: text(200, false), summary: text(12000), ownerId: ref('owners'), priorityId: ref('priorities'),
    estimatedCost: money, targetFunding: money, securedFunding: { ...money, nullable: false }, currencyCode: choice('AUD', 'NZD'), expectedJobs: integer(0, 2147483647), expectedBenefit: text(240), targetDate: date,
    // Controlled category/stage selectors are maintained through council-proof endpoints, not raw enum writes.
  } },
  'work-items': { model: 'WorkItem', label: 'Work item', fields: { title: text(240, false), projectId: ref('projects'), grantId: ref('grants'), ownerId: ref('owners'), workType: choice('action', 'grant_task', 'decision', 'risk'), status: deliveryStatus, priority: choice('low', 'medium', 'high', 'critical'), dueDate: date, detail: text(12000), impact: integer(1, 5), likelihood: integer(1, 5) }, delivery: ['title', 'status', 'dueDate', 'detail', 'impact', 'likelihood'] },
  evidence: { model: 'EvidenceItem', label: 'Project / grant evidence', fields: { ...evidenceFields, projectId: ref('projects'), grantId: ref('grants') }, delivery: ['title', 'evidenceType', 'externalUrl', 'source'] },
  actions: { model: 'StrategyAction', label: 'Strategy action', resource: 'action', fields: { title: text(300, false), description: text(12000), ownerId: ref('owners'), focusAreaId: ref('focusAreas'), actionCode: text(80), contributingTeams: { type: 'list', max: 30, itemMax: 160, nullable: false }, deliveryPathway: choice('operational', 'capital', 'partnership', 'advocacy', 'policy', 'program', 'other'), status: { type: 'select', options: [], nullable: false }, statusRationale: text(8000), startDate: date, targetDate: date, nextStep: text(8000), nextDecision: text(8000), nextDecisionDueAt: date, estimatedCost: money, securedFunding: { ...money, nullable: false }, currencyCode: choice('AUD', 'NZD'), budgetStatus: choice('not_costed', 'indicative', 'approved', 'funded', 'not_required'), readinessScore: integer(0, 100, false), reportingPriority: choice('standard', 'executive', 'critical') }, delivery: ['status', 'statusRationale', 'nextStep', 'nextDecision', 'nextDecisionDueAt'] },
  milestones: { model: 'ActionMilestone', label: 'Milestone', fields: { title: text(240, false), description: text(8000), ownerId: ref('owners'), dueDate: date, status: deliveryStatus, completionEvidence: text(8000), varianceExplanation: text(8000) }, delivery: ['status', 'completionEvidence', 'varianceExplanation'] },
  measures: { model: 'StrategyMeasure', label: 'Action measure', fields: { name: text(200, false), description: text(8000), unit: text(80), baselineValue: text(120), baselineDate: date, targetValue: text(120), targetDate: date, currentValue: text(120), lastMeasuredAt: date, reportingFrequency: choice('monthly', 'quarterly', 'half_yearly', 'annual', 'ad_hoc'), evidence: text(8000) }, delivery: ['currentValue', 'lastMeasuredAt', 'evidence'] },
  'action-evidence': { model: 'ActionEvidenceLink', label: 'Action evidence', fields: evidenceFields, delivery: ['title', 'evidenceType', 'externalUrl', 'source'] },
  funding: { model: 'ActionFundingPosition', label: 'Action funding', configOnly: true, fields: { sourceName: text(200, false), sourceType: choice('grant', 'budget', 'partner', 'private', 'advocacy', 'other'), amount: money, currencyCode: choice('AUD', 'NZD'), status: choice('identified', 'preparing', 'submitted', 'approved', 'secured', 'not_proceeding'), dueDate: date, note: text(8000) } },
  stakeholders: { model: 'StrategyStakeholder', label: 'Action stakeholder', fields: { ownerId: ref('owners'), name: text(180, false), organisationName: text(180), stakeholderType: choice('internal', 'government', 'business', 'community', 'delivery_partner', 'investor', 'other'), roleDescription: text(8000), influence: choice('low', 'medium', 'high'), engagementStatus: choice('not_started', 'engaged', 'supportive', 'watching', 'at_risk'), nextEngagementAt: date }, delivery: ['roleDescription', 'engagementStatus', 'nextEngagementAt'] },
  risks: { model: 'StrategyRiskIssue', label: 'Strategy risk / issue', fields: { actionId: ref('actions'), dependencyId: ref('dependencies'), ownerId: ref('owners'), issueType: choice('risk', 'issue'), title: text(260, false), detail: text(12000), status: choice('open', 'monitoring', 'mitigating', 'resolved', 'accepted'), impact: integer(1, 5), likelihood: integer(1, 5), mitigation: text(12000), dueDate: date }, delivery: ['detail', 'status', 'impact', 'likelihood', 'mitigation', 'dueDate'] },
  decisions: { model: 'StrategyDecision', label: 'Strategy decision', fields: { actionId: ref('actions'), projectId: ref('projects'), ownerId: ref('owners'), title: text(260, false), recommendation: text(12000), decisionStatus: choice('draft', 'required', 'approved', 'declined', 'deferred', 'implemented'), decisionMaker: text(180), dueDate: date, decidedAt: timestamp, decisionText: text(12000), followUpAction: text(12000) }, delivery: ['recommendation', 'followUpAction'] },
};
export const CONFIG_ROLES = ['org_admin', 'portfolio_manager'];
const READ_ROLES = [...CONFIG_ROLES, 'contributor', 'executive'];
export function validId(value) { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
export function safeEvidenceUrl(value) {
  if (typeof value !== 'string' || value.length > 1000 || /[\u0000-\u0020\u007f]/.test(value)) return false;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !!url.hostname && !url.username && !url.password; } catch { return false; }
}
function descriptor(kind) { const spec = Object.hasOwn(MAINTENANCE_KINDS, kind) && MAINTENANCE_KINDS[kind]; if (!spec) fail(404, 'Unsupported maintenance record type.'); return spec; }
export function validateChanges(kind, changes) {
  const { fields } = descriptor(kind);
  if (!changes || typeof changes !== 'object' || Array.isArray(changes) || !Object.keys(changes).length || Object.keys(changes).length > 40) fail(422, 'Supply a non-empty changes object.');
  const result = {};
  for (const [key, value] of Object.entries(changes)) {
    const spec = Object.hasOwn(fields, key) && fields[key];
    if (!spec) fail(422, `Field ${key} cannot be changed here.`);
    if (value === null) { if (!spec.nullable) fail(422, `${key} cannot be empty.`); result[key] = null; continue; }
    let valid = false;
    switch (spec.type) {
      case 'text': valid = typeof value === 'string' && value.length <= spec.max && (spec.nullable || !!value.trim()) && !/[\u0000]/.test(value); break;
      case 'url': valid = safeEvidenceUrl(value); break;
      case 'select': valid = typeof value === 'string' && (key === 'status' && kind === 'actions' ? /^[a-zA-Z0-9_-]{1,60}$/.test(value) : spec.options.includes(value)); break;
      case 'reference': valid = validId(value); break;
      case 'date': valid = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; break;
      case 'datetime-local': valid = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value)); break;
      case 'checkbox': valid = typeof value === 'boolean'; break;
      case 'number': valid = typeof value === 'number' && Number.isFinite(value) && value >= spec.min && value <= spec.max && (spec.decimals === 0 ? Number.isInteger(value) : Math.abs(value * 100 - Math.round(value * 100)) < 0.01); break;
      case 'list': valid = Array.isArray(value) && value.length <= spec.max && value.every((item) => typeof item === 'string' && !!item.trim() && item.length <= spec.itemMax) && new Set(value).size === value.length; break;
      default: valid = false;
    }
    if (!valid) fail(422, `${key} has an invalid value.`);
    result[key] = value;
  }
  return result;
}
const asPlain = (record) => record?.get ? record.get({ plain: true }) : record;
const iso = (value) => value ? new Date(value).toISOString() : null;
export function assertPreconditions(body, record, state) {
  if (!body || !Number.isSafeInteger(body.expectedVersion) || body.expectedVersion < 0 || typeof body.expectedUpdatedAt !== 'string' || Number.isNaN(Date.parse(body.expectedUpdatedAt))) fail(428, 'Refresh the record and supply expectedVersion and expectedUpdatedAt.', 'maintenance_precondition_required');
  if (body.expectedVersion !== Number(state?.version || 0) || iso(body.expectedUpdatedAt) !== iso(record.updatedAt)) fail(409, 'This record changed. Refresh, review the latest values and retry.', 'maintenance_conflict');
}
export function createMaintenanceService({ sequelize, models, Archive, audit }) {
  const find = (model, organizationId, id, transaction, extra = {}) => models[model].findOne({ where: { organizationId, id, ...extra }, transaction, ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}) });
  async function identity(req, transaction) {
    if (!req.auth?.sub || !validId(req.tenant?.organizationId) || req.auth.organizationId !== req.tenant.organizationId) fail(401, 'Authentication is required.');
    const user = await find('User', req.tenant.organizationId, req.auth.sub, transaction, { status: 'active' });
    if (!user || Number(user.sessionVersion || 0) !== Number(req.auth.sessionVersion || 0)) fail(401, 'Your session is no longer valid.');
    if (!READ_ROLES.includes(user.role)) fail(403, 'This role cannot access Council record maintenance.');
    return user;
  }
  async function stateFor(organizationId, kind, recordId, transaction) { return Archive.findOne({ where: { organizationId, kind, recordId }, transaction }); }
  async function context(organizationId, kind, record, transaction) {
    const spec = descriptor(kind); const ctx = {};
    if (spec.resource) ctx[spec.resource] = record;
    if (record.actionId) {
      ctx.action = await find('StrategyAction', organizationId, record.actionId, transaction);
      if (!ctx.action || (record.strategyId && ctx.action.strategyId !== record.strategyId)) fail(422, 'The parent action is unavailable in this strategy.');
    }
    if (record.projectId) { ctx.project = await find('CivicProject', organizationId, record.projectId, transaction); if (!ctx.project) fail(422, 'The parent project is unavailable.'); }
    if (record.grantId) { ctx.grant = await find('Grant', organizationId, record.grantId, transaction); if (!ctx.grant) fail(422, 'The parent grant is unavailable.'); }
    const strategyId = record.strategyId || ctx.action?.strategyId;
    if (strategyId) { ctx.strategy = await find('StrategicPlan', organizationId, strategyId, transaction); if (!ctx.strategy) fail(422, 'The parent strategy is unavailable.'); }
    return ctx;
  }
  async function canDeliver(organizationId, user, record, ctx, transaction) {
    if (record.ownerId === user.id || ctx.action?.ownerId === user.id || ctx.project?.ownerId === user.id || ctx.grant?.leadId === user.id) return true;
    for (const resourceType of ['project', 'action']) {
      if (!ctx[resourceType]) continue;
      const participant = await models.CollaborationParticipant.findOne({ where: { organizationId, resourceType, resourceId: ctx[resourceType].id, userId: user.id, role: ['accountable', 'responsible', 'contributor'] }, transaction });
      if (participant) return true;
    }
    return false;
  }
  async function archivedParent(organizationId, kind, record, ctx, transaction) {
    if (ctx.strategy?.status === 'archived') return true;
    for (const [parentKind, parent] of [['projects', ctx.project], ['actions', ctx.action]]) {
      if (parent && (parentKind !== kind || parent.id !== record.id) && ((parentKind === 'actions' && !parent.isActive) || (await stateFor(organizationId, parentKind, parent.id, transaction))?.archivedAt)) return true;
    }
    return false;
  }
  async function capabilities(organizationId, user, kind, record, state, ctx, transaction) {
    const spec = descriptor(kind); const manager = CONFIG_ROLES.includes(user.role);
    const blocked = !!state?.archivedAt || (kind === 'actions' && record.isActive === false) || await archivedParent(organizationId, kind, record, ctx, transaction);
    const contributor = user.role === 'contributor' && !spec.configOnly && await canDeliver(organizationId, user, record, ctx, transaction);
    return { editableFields: blocked ? [] : manager ? Object.keys(spec.fields) : contributor ? spec.delivery || [] : [], canArchive: manager && !state?.archivedAt, canRestore: manager && !!state?.archivedAt, readOnlyReason: blocked ? 'Archived records or records under archived parents must be restored before editing.' : user.role === 'executive' ? 'Executive access is read-only.' : !manager && !contributor ? 'Delivery changes require ownership or an assigned contributor role.' : null };
  }
  async function fieldsFor(organizationId, kind, record, ctx, transaction) {
    const fields = Object.fromEntries(Object.entries(descriptor(kind).fields).map(([key, spec]) => [key, { ...spec }]));
    if (kind === 'actions') {
      const statuses = await models.StrategyStatusDefinition.findAll({ where: { organizationId, strategyId: record.strategyId, isActive: true }, attributes: ['code', 'label', 'category'], limit: 100, transaction });
      fields.status.options = statuses.map((item) => item.code);
      fields.status.optionLabels = Object.fromEntries(statuses.map((item) => [item.code, item.label]));
      fields.status.completeCode = statuses.find((item) => item.category === 'complete')?.code || null;
    }
    return fields;
  }
  async function serialize(organizationId, user, kind, record, state, transaction) {
    const ctx = await context(organizationId, kind, record, transaction);
    const plain = asPlain(record);
    // Explicit response allowlist; storageKey, emails and unrelated associations never leave this API.
    const data = Object.fromEntries(['id', 'updatedAt', 'createdAt', 'strategyId', 'actionId', 'projectId', 'grantId', 'completedAt', 'resolvedAt', ...Object.keys(descriptor(kind).fields)].filter((key) => Object.hasOwn(plain, key)).map((key) => [key, plain[key]]));
    // Older create endpoints allowed arbitrary URI schemes. Never return unsafe legacy
    // links or embedded URL credentials to this UI, even before their records are edited.
    if (data.externalUrl && !safeEvidenceUrl(data.externalUrl)) data.externalUrl = null;
    return { ...data, maintenance: { kind, version: Number(state?.version || 0), archivedAt: state?.archivedAt || null, archiveReason: state?.reason || null, ...await capabilities(organizationId, user, kind, record, state, ctx, transaction), fields: await fieldsFor(organizationId, kind, record, ctx, transaction) } };
  }
  async function validateReferences(organizationId, kind, record, changes, transaction) {
    const merged = { ...asPlain(record), ...changes }; const ctx = await context(organizationId, kind, merged, transaction);
    const strategyId = merged.strategyId || ctx.action?.strategyId;
    const references = { owners: ['User', { status: 'active', role: [...CONFIG_ROLES, 'contributor'] }], projects: ['CivicProject', {}], grants: ['Grant', {}], priorities: ['Priority', { status: 'active' }], actions: ['StrategyAction', { strategyId, isActive: true }], focusAreas: ['StrategyFocusArea', { strategyId, status: 'active' }], dependencies: ['ActionDependency', { strategyId }] };
    for (const [key, value] of Object.entries(changes)) {
      const reference = descriptor(kind).fields[key]?.reference;
      if (!reference || value === null) continue;
      const [model, extra] = references[reference];
      const linked = await find(model, organizationId, value, transaction, extra);
      if (!linked) fail(422, `${key} is not available in this Council workspace.`);
      if (['projects', 'actions'].includes(reference) && (await stateFor(organizationId, reference, value, transaction))?.archivedAt) fail(422, `${key} is archived. Restore it before linking.`);
    }
    if (merged.projectId && ctx.grant?.projectId && ctx.grant.projectId !== merged.projectId) fail(422, 'The grant belongs to a different project.');
    if (merged.dependencyId && strategyId && !await find('ActionDependency', organizationId, merged.dependencyId, transaction, { strategyId })) fail(422, 'The dependency is unavailable in this strategy.');
    if (kind === 'actions' && Object.hasOwn(changes, 'status') && !await models.StrategyStatusDefinition.findOne({ where: { organizationId, strategyId, code: changes.status, isActive: true }, transaction })) fail(422, 'Choose an active status configured for this strategy.');
    if (merged.startDate && merged.targetDate && merged.startDate > merged.targetDate) fail(422, 'The target date cannot precede the start date.');
    return ctx;
  }
  async function load(req, kind, id, transaction) {
    descriptor(kind); if (!validId(id)) fail(422, 'Invalid record ID.');
    const user = await identity(req, transaction); const organizationId = req.tenant.organizationId;
    const record = await find(descriptor(kind).model, organizationId, id, transaction);
    if (!record) fail(404, 'Record not found in this Council workspace.');
    const state = await stateFor(organizationId, kind, id, transaction);
    return { user, organizationId, record, state };
  }
  async function get(req, kind, id) { const loaded = await load(req, kind, id); return serialize(loaded.organizationId, loaded.user, kind, loaded.record, loaded.state); }
  async function mutate(req, kind, id, operation) {
    if (!['edit', 'archive', 'restore'].includes(operation)) fail(422, 'Invalid maintenance operation.');
    const body = req.body;
    const bodyKeys = operation === 'edit' ? ['changes', 'expectedVersion', 'expectedUpdatedAt'] : ['reason', 'expectedVersion', 'expectedUpdatedAt'];
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !bodyKeys.includes(key))) fail(422, 'Unsupported maintenance request fields.');
    const changes = operation === 'edit' ? validateChanges(kind, body.changes) : {};
    if (operation === 'archive' && (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000)) fail(422, 'An archive reason of 1–1000 characters is required.');
    return sequelize.transaction(async (transaction) => {
      const { user, organizationId, record, state: existingState } = await load(req, kind, id, transaction);
      const ctx = await context(organizationId, kind, record, transaction);
      const permissions = await capabilities(organizationId, user, kind, record, existingState, ctx, transaction);
      if (operation === 'edit' && Object.keys(changes).some((key) => !permissions.editableFields.includes(key))) fail(403, permissions.readOnlyReason || 'This field requires an organisation administrator or portfolio manager.');
      if (operation !== 'edit' && !CONFIG_ROLES.includes(user.role)) fail(403, 'Only an organisation administrator or portfolio manager can archive or restore records.');
      assertPreconditions(body, record, existingState);
      if (operation === 'archive' && existingState?.archivedAt) fail(409, 'This record is already archived.');
      if (operation === 'restore' && !existingState?.archivedAt) fail(409, 'This record is not archived by record maintenance.');
      if (operation === 'edit') {
        const resultingContext = await validateReferences(organizationId, kind, record, changes, transaction);
        if (await archivedParent(organizationId, kind, { ...asPlain(record), ...changes }, resultingContext, transaction)) fail(422, 'Restore the referenced parent before linking or editing this record.');
        if (kind === 'risks' && user.role === 'contributor' && changes.status === 'accepted') fail(403, 'Accepting a risk requires a manager.');
        if (['evidence', 'action-evidence'].includes(kind) && record.isVerified && ['externalUrl', 'evidenceType', 'source'].some((key) => Object.hasOwn(changes, key) && changes[key] !== record[key])) {
          // Changing verified material invalidates its attestation; only managers may explicitly reverify it.
          if (!Object.hasOwn(changes, 'isVerified')) changes.isVerified = false;
        }
        if (kind === 'milestones' && Object.hasOwn(changes, 'status')) changes.completedAt = changes.status === 'complete' ? record.completedAt || new Date() : null;
        if (kind === 'risks' && Object.hasOwn(changes, 'status')) changes.resolvedAt = changes.status === 'resolved' ? record.resolvedAt || new Date() : null;
        // priorityId is mirrored in ProjectPriority: keep existing associations rather than silently desynchronising them.
        if (kind === 'projects' && Object.hasOwn(changes, 'priorityId')) {
          const links = await models.ProjectPriority.findAll({ where: { organizationId, projectId: id }, transaction, lock: transaction.LOCK.UPDATE });
          for (const link of links) await link.update({ isPrimary: link.priorityId === changes.priorityId }, { transaction });
          if (changes.priorityId && !links.some((link) => link.priorityId === changes.priorityId)) await models.ProjectPriority.create({ organizationId, projectId: id, priorityId: changes.priorityId, isPrimary: true, assignedBy: user.id }, { transaction });
        }
        await record.update(changes, { transaction });
      }
      const state = existingState || await Archive.create({ organizationId, kind, recordId: id, version: 0 }, { transaction });
      const stateChanges = { version: Number(state.version || 0) + 1 };
      if (operation === 'archive') Object.assign(stateChanges, { archivedAt: new Date(), archivedBy: user.id, reason: body.reason.trim(), previousIsActive: kind === 'actions' ? record.isActive : null });
      if (operation === 'restore') Object.assign(stateChanges, { archivedAt: null, archivedBy: null, reason: null, restoredAt: new Date(), restoredBy: user.id });
      if (kind === 'actions' && operation !== 'edit') await record.update({ isActive: operation === 'restore' ? state.previousIsActive !== false : false }, { transaction });
      await state.update(stateChanges, { transaction });
      await audit(req, { entityType: `maintenance_${kind.replace(/-/g, '_')}`, entityId: id, action: operation === 'edit' ? 'updated' : operation === 'archive' ? 'archived' : 'restored', metadata: { fields: Object.keys(changes), version: stateChanges.version, ...(operation === 'archive' ? { reason: body.reason.trim() } : {}) }, transaction });
      // MySQL DATETIME precision can truncate Sequelize's in-memory milliseconds.
      // Return the committed representation, not a timestamp that the next save
      // would immediately reject despite the correct monotonic version.
      const persistedRecord = await find(descriptor(kind).model, organizationId, id, transaction);
      if (!persistedRecord) fail(503, 'The saved record could not be confirmed; no change was committed.');
      return serialize(organizationId, user, kind, persistedRecord, state, transaction);
    });
  }
  async function list(req, kind) {
    const spec = descriptor(kind); const user = await identity(req); const organizationId = req.tenant.organizationId;
    const allowed = ['projectId', 'actionId', 'strategyId', 'grantId', 'offset', 'limit', 'archived'];
    const query = req.query || {}; if (Object.keys(query).some((key) => !allowed.includes(key))) fail(422, 'Unsupported list filter.');
    const where = { organizationId };
    const supportedFilters = {
      projects: ['projectId'], actions: ['actionId', 'strategyId'],
      'work-items': ['projectId', 'grantId'], evidence: ['projectId', 'grantId'],
      milestones: ['actionId'], measures: ['actionId'], 'action-evidence': ['actionId'],
      funding: ['actionId'], stakeholders: ['actionId'], risks: ['actionId', 'strategyId'],
      decisions: ['actionId', 'strategyId', 'projectId'],
    };
    for (const key of ['projectId', 'actionId', 'strategyId', 'grantId']) {
      if (!query[key]) continue;
      if (!supportedFilters[kind].includes(key)) fail(422, 'This filter is not supported for this record type.');
      if (!validId(query[key])) fail(422, `Invalid ${key}.`);
      const parentModel = { projectId: 'CivicProject', actionId: 'StrategyAction', strategyId: 'StrategicPlan', grantId: 'Grant' }[key];
      if (!await find(parentModel, organizationId, query[key])) fail(404, 'Parent record not found.');
      if ((kind === 'projects' && key === 'projectId') || (kind === 'actions' && key === 'actionId')) where.id = query[key];
      else where[key] = query[key];
    }
    const limit = query.limit === undefined ? 25 : Number(query.limit); const offset = query.offset === undefined ? 0 : Number(query.offset);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(offset) || offset < 0 || offset > 100000 || (query.archived !== undefined && !['true', 'false', 'all'].includes(query.archived))) fail(422, 'Invalid pagination or archive filter.');
    // Never fetch storage paths even temporarily for list responses.
    const rows = await models[spec.model].findAll({ where, attributes: { exclude: ['storageKey'] }, order: [['createdAt', 'DESC'], ['id', 'ASC']], limit: limit + 1, offset });
    const page = rows.slice(0, limit); const states = page.length ? await Archive.findAll({ where: { organizationId, kind, recordId: page.map((item) => item.id) } }) : [];
    const byId = Object.fromEntries(states.map((item) => [item.recordId, item]));
    const selected = query.archived && query.archived !== 'all' ? page.filter((item) => !!byId[item.id]?.archivedAt === (query.archived === 'true')) : page;
    const data = await Promise.all(selected.map((record) => serialize(organizationId, user, kind, record, byId[record.id])));
    return { data, pagination: { offset, limit, hasMore: rows.length > limit, nextOffset: offset + limit, archiveFilterAppliedToPage: true } };
  }
  async function options(req, reference) {
    const user = await identity(req); if (!READ_ROLES.includes(user.role)) fail(403, 'Not permitted.');
    const organizationId = req.tenant.organizationId;
    const map = { owners: ['User', ['id', 'firstName', 'lastName', 'role'], { status: 'active', role: [...CONFIG_ROLES, 'contributor'] }], projects: ['CivicProject', ['id', 'name'], {}], grants: ['Grant', ['id', 'title', 'projectId'], {}], priorities: ['Priority', ['id', 'title'], { status: 'active' }], actions: ['StrategyAction', ['id', 'title', 'strategyId'], { isActive: true }], focusAreas: ['StrategyFocusArea', ['id', 'title', 'strategyId'], { status: 'active' }], dependencies: ['ActionDependency', ['id', 'detail', 'strategyId'], {}] };
    if (!Object.hasOwn(map, reference)) fail(404, 'Unsupported reference type.');
    const [model, attributes, extra] = map[reference];
    const query = req.query || {}; if (Object.keys(query).some((key) => !['offset', 'strategyId'].includes(key))) fail(422, 'Unsupported options filter.');
    const offset = Number(query.offset || 0); if (!Number.isInteger(offset) || offset < 0 || offset > 100000) fail(422, 'Invalid options offset.');
    if (query.strategyId) { if (!['actions', 'focusAreas', 'dependencies'].includes(reference) || !validId(query.strategyId) || !await find('StrategicPlan', organizationId, query.strategyId)) fail(422, 'Invalid strategy filter.'); extra.strategyId = query.strategyId; }
    const rows = await models[model].findAll({ where: { organizationId, ...extra }, attributes, limit: 101, offset, order: [['id', 'ASC']] });
    const page = rows.slice(0, 100);
    const states = ['projects', 'actions'].includes(reference) && page.length ? await Archive.findAll({ where: { organizationId, kind: reference, recordId: page.map((item) => item.id) } }) : [];
    const archivedIds = new Set(states.filter((item) => item.archivedAt).map((item) => item.recordId));
    return { data: page.filter((item) => !archivedIds.has(item.id)).map((item) => ({ ...Object.fromEntries(attributes.map((key) => [key, item[key]])), label: item.name || item.title || (reference === 'owners' ? `${item.firstName} ${item.lastName}` : String(item.detail || 'Dependency').slice(0, 120)) })), pagination: { hasMore: rows.length > 100, nextOffset: offset + 100 } };
  }
  return { get, mutate, list, options };
}
