import { Buffer } from 'node:buffer';

export class LifecycleError extends Error {
  constructor(code, status = 422) { super(code); this.code = code; this.status = status; }
}
export const LIFECYCLE_POLICY = Object.freeze({
  configured: false, retentionDays: null, schedulingEnabled: false, closureExecutionEnabled: false,
  erasureEnabled: false, backups: 'Human-approved backup expiry and restore suppression required; no backup deletion is performed.',
  objectVersions: 'All object versions, replicas and legal-hold flags require human inventory and verified approval; no object deletion is performed.',
});
// Artifact TTL is a privacy/resource limit, NOT a workspace retention policy.
export const EXPORT_LIMITS = Object.freeze({ pageSize: 200, maxRows: 20000, maxBytes: 8 * 1024 * 1024,
  maxMilliseconds: 12000, artifactTtlMilliseconds: 60 * 60 * 1000, leaseMilliseconds: 60000,
  maxRequestsPerHour: 3, maxConcurrentPerProcess: 2, maxReadyPerTenant: 2 });
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function validId(value) { if (typeof value !== 'string' || !UUID.test(value)) throw new LifecycleError('invalid_id'); return value; }
export function authorizeActor(auth, user, organization, capability = 'read') {
  if (!auth?.sub || !user || user.status !== 'active' || user.id !== auth.sub
    || user.role !== auth.role || user.organizationId !== auth.organizationId
    || Number(user.sessionVersion || 0) !== Number(auth.sessionVersion || 0)) throw new LifecycleError('authentication_required', 401);
  if (!organization || !['council', 'joint_organisation', 'demo'].includes(organization.organisationType)) throw new LifecycleError('tenant_not_found', 404);
  if (capability === 'platform_review') {
    if (user.role !== 'platform_admin') throw new LifecycleError('forbidden', 403);
    return;
  }
  if (organization.id !== user.organizationId) throw new LifecycleError('tenant_not_found', 404);
  // The legacy schema has only suspended, not a distinct security suspension. Fail closed for either.
  if (organization.status === 'suspended' || organization.securitySuspended === true) throw new LifecycleError('tenant_suspended', 403);
  if (capability === 'read' && ['org_admin', 'executive'].includes(user.role)) return;
  if (user.role !== 'org_admin') throw new LifecycleError('forbidden', 403);
  // Deliberately independent of subscription entitlement; this is authenticated recovery access only.
}
export function validateBody(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !allowed.includes(key))) throw new LifecycleError('invalid_fields');
  if (Buffer.byteLength(JSON.stringify(body), 'utf8') > 6000) throw new LifecycleError('request_too_large', 413);
  return body;
}
export function boundedText(value, min = 8, max = 2000) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) throw new LifecycleError('invalid_text');
  return value.trim();
}
export function reviewTransition(request, body, actorId, holdActive) {
  validateBody(body, ['decision', 'note', 'humanVerified', 'backupTreatmentVerified', 'objectVersionsVerified', 'approvalReference']);
  const note = boundedText(body.note);
  if (!['pending', 'reviewed'].includes(request.status)) throw new LifecycleError('invalid_transition', 409);
  if (!['review', 'approve', 'reject'].includes(body.decision)) throw new LifecycleError('invalid_decision');
  if (body.decision === 'review') return { status: 'reviewed', reviewNote: note, reviewedBy: actorId };
  if (request.requestedBy === actorId) throw new LifecycleError('independent_reviewer_required', 403);
  if (body.decision === 'reject') return { status: 'rejected', reviewNote: note, reviewedBy: actorId };
  if (body.humanVerified !== true || body.backupTreatmentVerified !== true || body.objectVersionsVerified !== true) throw new LifecycleError('human_verification_required');
  const approvalReference = boundedText(body.approvalReference, 8, 240);
  if (request.kind === 'closure' && holdActive) throw new LifecycleError('legal_hold_blocks_closure', 409);
  if (request.kind === 'retention') throw new LifecycleError('leadership_retention_policy_required', 409);
  return { status: request.kind === 'closure' ? 'access_closed_data_preserved' : 'approved', reviewNote: note, reviewedBy: actorId,
    approvalReference, humanVerified: true, backupTreatmentVerified: true, objectVersionsVerified: true };
}
export function assertExecutionAllowed({ holdActive } = {}) {
  if (holdActive) throw new LifecycleError('legal_hold_blocks_execution', 409);
  throw new LifecycleError('lifecycle_execution_disabled', 409);
}

const common = ['id', 'createdAt', 'updatedAt'];
const tenant = ['organizationId'];
const spec = (fields, { organization = false, where = {}, references = {}, jsonFields = [], sharedCatalog = false } = {}) => ({
  fields: [...common, ...(organization ? [] : tenant), ...fields.split(' ').filter(Boolean)], where, references, jsonFields, sharedCatalog,
});
// Reviewed positive field allowlists. Adding a model/attribute never automatically adds it to an export.
export const EXPORT_SCHEMA = Object.freeze({
  Organization: spec('name slug country organisationType planCode isDemo status defaultCurrency operatingContactName operatingContactRole operatingContactEmail workspaceOwnerId onboardingCompleteAt', { organization: true, references: { workspaceOwnerId: 'User' } }),
  User: spec('email firstName lastName role status lastLoginAt', { where: { role: ['org_admin', 'portfolio_manager', 'contributor', 'executive'] } }),
  Subscription: spec('planId status startsAt endsAt entitlements', { jsonFields: ['entitlements'] }),
  BillingProfile: spec('legalName abnNzbn billingEmail contactPhone taxIdCollected billingAddress', { jsonFields: ['billingAddress'] }),
  BillingInvoice: spec('subscriptionId invoiceNumber status currency amountDue amountPaid amountRemaining amountSubtotal amountTax dueAt paidAt', { references: { subscriptionId: 'Subscription' } }),
  BillingRefund: spec('invoiceId requestedBy amount currency status reason', { references: { invoiceId: 'BillingInvoice', requestedBy: 'User' } }),
  IntegrationConnection: spec('provider status lastSyncedAt'),
  CustomerContact: spec('name email title contactType isAuthorised createdBy', { references: { createdBy: 'User' } }),
  CustomerNote: spec('authorId body visibility', { where: { visibility: 'handover' }, references: { authorId: 'User' } }),
  TenantStateEvent: spec('fromStatus toStatus reason actorId', { references: { actorId: 'User' } }),
  SupportCase: spec('requesterId title category priority status summary ownerId firstResponseDueAt firstRespondedAt lastCustomerUpdateAt resolvedAt', { references: { requesterId: 'User', ownerId: 'User' } }),
  SupportAttachment: spec('supportCaseId uploadedBy originalFilename contentType sizeBytes checksumSha256', { references: { supportCaseId: 'SupportCase', uploadedBy: 'User' } }),
  SelectorOptionSet: spec('code label description appliesTo selectionMode maxSelections allowsOther scope status metadata', { jsonFields: ['metadata'], sharedCatalog: true }),
  SelectorOption: spec('optionSetId code label description sortOrder isOther isCustom status value', { jsonFields: ['value'], sharedCatalog: true, references: { optionSetId: 'SelectorOptionSet' } }),
  OrganizationSelectorOptionOverride: spec('optionId labelOverride status sortOrderOverride updatedBy', { references: { optionId: 'SelectorOption', updatedBy: 'User' } }),
  Priority: spec('title planReference outcomeArea status'),
  CivicProject: spec('priorityId ownerId name summary category stage estimatedCost targetFunding securedFunding currencyCode expectedJobs expectedBenefit targetDate isSample', { references: { priorityId: 'Priority', ownerId: 'User' } }),
  ProjectPriority: spec('projectId priorityId isPrimary assignedBy', { references: { projectId: 'CivicProject', priorityId: 'Priority', assignedBy: 'User' } }),
  ProjectSelectorValue: spec('projectId optionSetId optionId otherValue otherValueNormalized selectedBy metadata', { references: { projectId: 'CivicProject', optionSetId: 'SelectorOptionSet', optionId: 'SelectorOption', selectedBy: 'User' }, jsonFields: ['metadata'] }),
  ProjectConstraint: spec('projectId constraintOptionId constraintKey otherValue severityOptionId statusOptionId ownerId dueDate detail resolutionNote resolvedAt createdBy', { references: { projectId: 'CivicProject', constraintOptionId: 'SelectorOption', severityOptionId: 'SelectorOption', statusOptionId: 'SelectorOption', ownerId: 'User', createdBy: 'User' } }),
  ReadinessAssessment: spec('projectId scopeScore costScore approvalsScore partnerScore fundingScore deliveryScore score assessmentNote assessedAt', { references: { projectId: 'CivicProject' } }),
  FundingPathway: spec('projectId sourceName sourceType fit potentialAmount currencyCode dueDate status note', { references: { projectId: 'CivicProject' } }),
  Grant: spec('projectId fundingPathwayId title funder requestedAmount awardedAmount currencyCode status dueDate acquittalDueDate leadId notes isSample', { references: { projectId: 'CivicProject', fundingPathwayId: 'FundingPathway', leadId: 'User' } }),
  WorkItem: spec('projectId grantId ownerId title workType status priority dueDate detail impact likelihood', { references: { projectId: 'CivicProject', grantId: 'Grant', ownerId: 'User' } }),
  EvidenceItem: spec('projectId grantId title evidenceType externalUrl source isVerified', { references: { projectId: 'CivicProject', grantId: 'Grant' } }),
  StrategicPlan: spec('ownerId name reference version description startDate endDate reportingCadence status metadata', { references: { ownerId: 'User' }, jsonFields: ['metadata'] }),
  StrategyFocusArea: spec('strategyId code title description sortOrder status', { references: { strategyId: 'StrategicPlan' } }),
  StrategyStatusDefinition: spec('strategyId code label description category color sortOrder isDefault isActive', { references: { strategyId: 'StrategicPlan' } }),
  StrategyAction: spec('strategyId focusAreaId ownerId actionCode title description contributingTeams deliveryPathway status statusRationale startDate targetDate nextStep nextDecision nextDecisionDueAt estimatedCost securedFunding currencyCode budgetStatus readinessScore reportingPriority isActive', { references: { strategyId: 'StrategicPlan', focusAreaId: 'StrategyFocusArea', ownerId: 'User' }, jsonFields: ['contributingTeams'] }),
  StrategyActionProject: spec('actionId projectId relationshipType', { references: { actionId: 'StrategyAction', projectId: 'CivicProject' } }),
  ActionMilestone: spec('actionId ownerId title description dueDate completedAt status completionEvidence varianceExplanation', { references: { actionId: 'StrategyAction', ownerId: 'User' } }),
  ActionDependency: spec('strategyId dependentType dependentId predecessorType predecessorId dependencyType severity status ownerId dueDate escalationAt resolutionDate detail workaround resolutionEvidence resolutionNote handoverRequestedBy handoverRequestedTo handoverStatus handoverResponse proposedDueDate raci', { references: { strategyId: 'StrategicPlan', ownerId: 'User', handoverRequestedBy: 'User', handoverRequestedTo: 'User' }, jsonFields: ['raci'] }),
  QuarterlyReportingPeriod: spec('strategyId finalisedBy label financialYear quarter startsOn endsOn updateDueOn status openedAt finalisedAt', { references: { strategyId: 'StrategicPlan', finalisedBy: 'User' } }),
  QuarterlyActionUpdate: spec('actionId reportingPeriodId submittedBy status movement achievements evidenceSummary riskSummary decisionsRequired nextQuarterCommitments submittedAt version workflowStatus reviewRequestedFromUserId reviewedBy reviewedAt reviewComment includedInReportAt', { references: { actionId: 'StrategyAction', reportingPeriodId: 'QuarterlyReportingPeriod', submittedBy: 'User', reviewRequestedFromUserId: 'User', reviewedBy: 'User' } }),
  StrategyMeasure: spec('actionId name description unit baselineValue baselineDate targetValue targetDate currentValue lastMeasuredAt reportingFrequency evidence', { references: { actionId: 'StrategyAction' } }),
  StrategyDecision: spec('strategyId actionId projectId ownerId title recommendation decisionStatus decisionMaker dueDate decidedAt decisionText followUpAction', { references: { strategyId: 'StrategicPlan', actionId: 'StrategyAction', projectId: 'CivicProject', ownerId: 'User' } }),
  StrategyStakeholder: spec('actionId ownerId name organisationName stakeholderType roleDescription influence engagementStatus nextEngagementAt', { references: { actionId: 'StrategyAction', ownerId: 'User' } }),
  StrategyRiskIssue: spec('strategyId actionId dependencyId ownerId issueType title detail status impact likelihood mitigation dueDate resolvedAt', { references: { strategyId: 'StrategicPlan', actionId: 'StrategyAction', dependencyId: 'ActionDependency', ownerId: 'User' } }),
  ActionFundingPosition: spec('actionId sourceName sourceType amount currencyCode status dueDate note', { references: { actionId: 'StrategyAction' } }),
  ActionEvidenceLink: spec('actionId title evidenceType externalUrl source isVerified', { references: { actionId: 'StrategyAction' } }),
  StrategyReportSnapshot: spec('strategyId reportingPeriodId preparedBy reviewedBy approvedBy reportType version status content narrative reviewedAt approvedAt', { references: { strategyId: 'StrategicPlan', reportingPeriodId: 'QuarterlyReportingPeriod', preparedBy: 'User', reviewedBy: 'User', approvedBy: 'User' }, jsonFields: ['content'] }),
  StrategyAlert: spec('strategyId actionId dependencyId reportingPeriodId ownerId alertType severity title detail dueDate status firstDetectedAt lastDetectedAt resolvedAt', { references: { strategyId: 'StrategicPlan', actionId: 'StrategyAction', dependencyId: 'ActionDependency', reportingPeriodId: 'QuarterlyReportingPeriod', ownerId: 'User' } }),
  CollaborationParticipant: spec('resourceType resourceId userId role addedBy', { references: { userId: 'User', addedBy: 'User' } }),
  CollaborationThread: spec('resourceType resourceId title body mentionUserIds createdBy', { references: { createdBy: 'User' }, jsonFields: ['mentionUserIds'] }),
  CollaborationComment: spec('threadId body mentionUserIds createdBy', { references: { threadId: 'CollaborationThread', createdBy: 'User' }, jsonFields: ['mentionUserIds'] }),
  CollaborationRequest: spec('resourceType resourceId requestType title prompt requestedFromUserId requestedByUserId dueDate status response completedAt', { references: { requestedFromUserId: 'User', requestedByUserId: 'User' } }),
  CollaborationActivity: spec('resourceType resourceId activityType summary metadata actorId', { references: { actorId: 'User' }, jsonFields: ['metadata'] }),
  PartnerCommitment: spec('actionId stakeholderId ownerId contactName contactRole contributionType contribution dueDate status evidenceNote sourceUrl', { references: { actionId: 'StrategyAction', stakeholderId: 'StrategyStakeholder', ownerId: 'User' } }),
  FundingCollaborationRoom: spec('actionId fundingPositionId ownerId name purpose stage dueDate status', { references: { actionId: 'StrategyAction', fundingPositionId: 'ActionFundingPosition', ownerId: 'User' } }),
  FundingRoomCheckpoint: spec('fundingRoomId ownerId checkpointType title dueDate status note', { references: { fundingRoomId: 'FundingCollaborationRoom', ownerId: 'User' } }),
  EngagementPlan: spec('actionId ownerId purpose audience participationLevel questions methods startsOn endsOn findings decisionImpact closureMessage status', { references: { actionId: 'StrategyAction', ownerId: 'User' }, jsonFields: ['methods'] }),
  DecisionPack: spec('strategyId actionId sourceType sourceId ownerId decisionMakerId title decisionQuestion recommendation options financialImplications evidenceSummary dueDate status outcome decidedAt', { references: { strategyId: 'StrategicPlan', actionId: 'StrategyAction', ownerId: 'User', decisionMakerId: 'User' }, jsonFields: ['options'] }),
  ReviewPack: spec('strategyId reportingPeriodId ownerId template title purpose desiredOutcome executiveSummary meetingAt audience status internalOnly', { references: { strategyId: 'StrategicPlan', reportingPeriodId: 'QuarterlyReportingPeriod', ownerId: 'User' } }),
  ReviewPackItem: spec('reviewPackId resourceType resourceId category note sortOrder', { references: { reviewPackId: 'ReviewPack' } }),
  ReviewPackQuestion: spec('reviewPackId askedBy question response respondedBy respondedAt', { references: { reviewPackId: 'ReviewPack', askedBy: 'User', respondedBy: 'User' } }),
  ReviewPackOutcome: spec('reviewPackId resourceType resourceId outcomeType outcome ownerId dueDate recordedBy', { references: { reviewPackId: 'ReviewPack', ownerId: 'User', recordedBy: 'User' } }),
  UserWatch: spec('userId resourceType resourceId deliveryPreference isActive', { references: { userId: 'User' } }),
  CollaborationNotification: spec('userId resourceType resourceId notificationType title detail readAt deliveryPreference', { references: { userId: 'User' } }),
  AuditLog: spec('userId entityType entityId action', { references: { userId: 'User' } }),
  TenantLifecycleState: spec('holdActive closedAt'),
  TenantLifecycleRequest: spec('kind reason status requestedBy reviewedBy reviewNote approvalReference humanVerified backupTreatmentVerified objectVersionsVerified reviewedAt', { references: { requestedBy: 'User', reviewedBy: 'User' } }),
  TenantAttachmentRequest: spec('kind attachmentId requestedBy status', { references: { requestedBy: 'User' } }),
});
export const EXPORT_EXCLUSIONS = Object.freeze(['passwords, auth/reset/invitation/session tokens and MFA material', 'platform/system configuration and provider credentials/references',
  'private storage keys, signed URLs and raw attachment binaries', 'internal customer notes, internal billing notes, audit IPs and unrestricted audit payloads',
  'other tenants, deleted rows and public prospect/enquiry records']);

const secretKey = /password|secret|token|credential|authorization|cookie|mfa|recovery.?code|session|storage.?key|private.?key|encrypted|provider.?reference|stripe|internal.?email|ip.?address/i;
export function safeUrl(value) {
  try { const url = new URL(value); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null; return url.href; } catch { return null; }
}
export function scrubJson(value, organizationId, depth = 0) {
  if (depth > 15) throw new LifecycleError('export_json_depth_exceeded');
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return /^https?:\/\//i.test(value) ? safeUrl(value) : value;
  if (typeof value !== 'object') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => scrubJson(item, organizationId, depth + 1));
  if ((value.organizationId && value.organizationId !== organizationId) || (value.organization_id && value.organization_id !== organizationId)) return null;
  const output = {};
  for (const [key, item] of Object.entries(value)) if (!secretKey.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key)) output[key] = scrubJson(item, organizationId, depth + 1);
  return output;
}
export function projectExportRow(name, row, organizationId, schema = EXPORT_SCHEMA) {
  const definition = schema[name];
  if (!definition || (name === 'Organization' ? row.id !== organizationId : row.organizationId !== organizationId && !(definition.sharedCatalog && row.organizationId === null))) throw new LifecycleError('export_tenant_boundary_violation', 409);
  const output = {};
  for (const field of definition.fields) if (Object.hasOwn(row, field)) output[field] = scrubJson(row[field], organizationId);
  return output;
}
const resourceModels = { action: 'StrategyAction', project: 'CivicProject', decision: 'StrategyDecision', dependency: 'ActionDependency', funding_room: 'FundingCollaborationRoom', review_pack: 'ReviewPack', quarterly_update: 'QuarterlyActionUpdate', milestone: 'ActionMilestone', risk: 'StrategyRiskIssue', funding_position: 'ActionFundingPosition', partner_commitment: 'PartnerCommitment' };
export function redactForeignReferences(graph, schema = EXPORT_SCHEMA) {
  const ids = Object.fromEntries(Object.entries(graph).map(([name, rows]) => [name, new Set(rows.map((row) => row.id))]));
  let redacted = 0;
  const check = (row, field, model) => { if (row[field] && (!model || !ids[model]?.has(row[field]))) { row[field] = null; redacted++; } };
  for (const [name, rows] of Object.entries(graph)) for (const row of rows) {
    for (const [field, model] of Object.entries(schema[name]?.references || {})) check(row, field, model);
    for (const prefix of ['resource', 'source', 'dependent', 'predecessor']) if (row[`${prefix}Id`] && row[`${prefix}Type`]) check(row, `${prefix}Id`, resourceModels[row[`${prefix}Type`]]);
    for (const [field, value] of Object.entries(row)) if (!['id', 'organizationId'].includes(field) && /Id$/.test(field) && typeof value === 'string' && UUID.test(value) && !Object.values(ids).some((set) => set.has(value))) { row[field] = null; redacted++; }
    if (row.mentionUserIds) row.mentionUserIds = row.mentionUserIds.filter((id) => ids.User?.has(id));
    // JSON identifiers are checked recursively; the owner tenant's descriptive JSON remains intact.
    const walk = (value) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (typeof item === 'string' && UUID.test(item) && key !== 'organizationId' && key !== 'organization_id' && !Object.values(ids).some((set) => set.has(item))) { value[key] = null; redacted++; }
        else walk(item);
      }
    };
    for (const field of schema[name]?.jsonFields || []) walk(row[field]);
  }
  return redacted;
}
export function attachmentManifest(graph) {
  return [...(graph.SupportAttachment || []).map((row) => ({ kind: 'support', id: row.id, originalFilename: row.originalFilename, contentType: row.contentType, sizeBytes: row.sizeBytes, checksumSha256: row.checksumSha256 })),
    ...(graph.EvidenceItem || []).filter((row) => row.evidenceType === 'document').map((row) => ({ kind: 'evidence', id: row.id, title: row.title }))]
    .map((row) => ({ ...row, request: { method: 'POST', path: '/v1/tenant-lifecycle/attachment-requests', body: { kind: row.kind, attachmentId: row.id }, authentication: 'current active org_admin session', delivery: 'human-verified private delivery; not a public URL' } }));
}

export async function collectTenantGraph({ repository, organizationId, transaction, limits = EXPORT_LIMITS, now = Date.now, schema = EXPORT_SCHEMA }) {
  const start = now(); const graph = {}; let totalRows = 0; let bytes = 0;
  const check = () => { if (now() - start > limits.maxMilliseconds) throw new LifecycleError('export_time_limit', 413); };
  for (const [name, definition] of Object.entries(schema)) {
    graph[name] = []; let cursor = null;
    while (true) {
      check();
      const page = await repository.readPage({ name, definition, organizationId, cursor, limit: limits.pageSize, transaction });
      check();
      if (!Array.isArray(page) || page.length > limits.pageSize) throw new LifecycleError('export_invalid_page', 409);
      for (const row of page) {
        if (cursor && row.id <= cursor) throw new LifecycleError('export_invalid_cursor', 409);
        const projected = projectExportRow(name, row, organizationId, schema);
        bytes += Buffer.byteLength(JSON.stringify(projected), 'utf8'); totalRows++;
        if (totalRows > limits.maxRows || bytes > limits.maxBytes) throw new LifecycleError('export_resource_limit', 413);
        graph[name].push(projected); cursor = row.id;
      }
      if (page.length < limits.pageSize) break;
    }
  }
  const redactedReferences = redactForeignReferences(graph, schema);
  const manifest = { version: 'civicpath-tenant-export/1', organizationId, snapshotAt: new Date(start).toISOString(), currentRowsOnly: true,
    complete: true, format: 'JSON', exclusions: EXPORT_EXCLUSIONS, attachments: 'metadata and authenticated human delivery requests only', redactedReferences,
    tables: Object.fromEntries(Object.entries(schema).map(([name, definition]) => [name, { fields: definition.fields, references: definition.references, count: graph[name].length, filter: definition.where, sharedCatalog: definition.sharedCatalog }])), totalRows };
  const document = { manifest, data: graph, attachmentManifest: attachmentManifest(graph) };
  const serialized = JSON.stringify(document);
  if (Buffer.byteLength(serialized, 'utf8') > limits.maxBytes) throw new LifecycleError('export_resource_limit', 413);
  check();
  return { document, serialized, totalRows, byteCount: Buffer.byteLength(serialized, 'utf8') };
}
