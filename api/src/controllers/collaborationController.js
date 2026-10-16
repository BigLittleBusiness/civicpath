import Joi from 'joi';
import {
  ActionDependency,
  ActionFundingPosition,
  CollaborationActivity,
  CollaborationComment,
  CollaborationNotification,
  CollaborationParticipant,
  CollaborationRequest,
  CollaborationThread,
  CivicProject,
  DecisionPack,
  EngagementPlan,
  FundingCollaborationRoom,
  FundingRoomCheckpoint,
  PartnerCommitment,
  QuarterlyActionUpdate,
  QuarterlyReportingPeriod,
  ReviewPack,
  ReviewPackItem,
  ReviewPackOutcome,
  ReviewPackQuestion,
  StrategyAction,
  StrategyDecision,
  StrategyRiskIssue,
  StrategyStakeholder,
  StrategicPlan,
  User,
  UserWatch,
} from '../models/index.js';
import { sequelize } from '../config/database.js';
import { recordAudit } from '../services/audit.js';

const RESOURCE_TYPES = ['action', 'project', 'decision', 'dependency', 'funding_room', 'review_pack', 'quarterly_update'];
const PACK_ITEM_TYPES = ['action', 'project', 'dependency', 'risk', 'decision', 'funding_position', 'partner_commitment', 'quarterly_update'];
const MANAGER_ROLES = ['org_admin', 'portfolio_manager'];
const participantSchema = Joi.object({ userId: Joi.string().uuid().required(), role: Joi.string().valid('accountable', 'contributor', 'reviewer', 'approver', 'informed', 'responsible', 'consulted').required() });
const threadSchema = Joi.object({ title: Joi.string().trim().max(240).allow('', null), body: Joi.string().trim().min(1).max(6000).required(), mentionUserIds: Joi.array().items(Joi.string().uuid()).max(12).default([]) });
const commentSchema = Joi.object({ body: Joi.string().trim().min(1).max(6000).required(), mentionUserIds: Joi.array().items(Joi.string().uuid()).max(12).default([]) });
const requestSchema = Joi.object({ requestType: Joi.string().valid('update', 'evidence', 'review', 'decision_input', 'handover').required(), title: Joi.string().trim().max(240).required(), prompt: Joi.string().max(6000).allow('', null), requestedFromUserId: Joi.string().uuid().required(), dueDate: Joi.date().iso().allow(null) });
const requestUpdateSchema = Joi.object({ status: Joi.string().valid('open', 'submitted', 'changes_requested', 'complete', 'declined').required(), response: Joi.string().max(6000).allow('', null) });
const handoverSchema = Joi.object({ requestedToUserId: Joi.string().uuid().required(), detail: Joi.string().max(8000).allow('', null), dueDate: Joi.date().iso().allow(null), raci: Joi.object({ responsibleUserId: Joi.string().uuid().allow(null), accountableUserId: Joi.string().uuid().allow(null), consultedUserIds: Joi.array().items(Joi.string().uuid()).max(12).default([]), informedUserIds: Joi.array().items(Joi.string().uuid()).max(12).default([]) }).default({}) });
const handoverResponseSchema = Joi.object({ handoverStatus: Joi.string().valid('accepted', 'clarification_requested', 'revised_date_proposed', 'declined').required(), response: Joi.string().max(8000).allow('', null), proposedDueDate: Joi.date().iso().allow(null) });
const updateWorkflowSchema = Joi.object({ workflowStatus: Joi.string().valid('draft', 'submitted_for_review', 'changes_requested', 'endorsed', 'included_in_report').required(), reviewRequestedFromUserId: Joi.string().uuid().allow(null), reviewComment: Joi.string().max(6000).allow('', null) });
const commitmentSchema = Joi.object({ stakeholderId: Joi.string().uuid().allow(null), ownerId: Joi.string().uuid().allow(null), contactName: Joi.string().max(180).allow('', null), contactRole: Joi.string().max(180).allow('', null), contributionType: Joi.string().valid('funding', 'land', 'data', 'advocacy', 'approval', 'co_delivery', 'introduction', 'other').default('other'), contribution: Joi.string().max(8000).required(), dueDate: Joi.date().iso().allow(null), status: Joi.string().valid('not_started', 'in_progress', 'confirmed', 'complete', 'at_risk', 'declined').default('not_started'), evidenceNote: Joi.string().max(8000).allow('', null), sourceUrl: Joi.string().uri().allow('', null) });
const fundingRoomSchema = Joi.object({ fundingPositionId: Joi.string().uuid().allow(null), ownerId: Joi.string().uuid().allow(null), name: Joi.string().max(240).required(), purpose: Joi.string().max(8000).allow('', null), stage: Joi.string().valid('planning', 'eligibility', 'evidence', 'finance_review', 'executive_review', 'submitted', 'outcome', 'closed').default('planning'), dueDate: Joi.date().iso().allow(null), status: Joi.string().valid('active', 'on_hold', 'complete', 'not_proceeding').default('active') });
const checkpointSchema = Joi.object({ ownerId: Joi.string().uuid().allow(null), checkpointType: Joi.string().valid('eligibility', 'evidence', 'finance', 'partner_commitment', 'internal_review', 'submission', 'outcome').required(), title: Joi.string().max(240).required(), dueDate: Joi.date().iso().allow(null), status: Joi.string().valid('not_started', 'in_progress', 'complete', 'blocked').default('not_started'), note: Joi.string().max(8000).allow('', null) });
const engagementSchema = Joi.object({ ownerId: Joi.string().uuid().allow(null), purpose: Joi.string().max(8000).required(), audience: Joi.string().max(8000).allow('', null), participationLevel: Joi.string().valid('inform', 'consult', 'involve', 'collaborate', 'empower').default('inform'), questions: Joi.string().max(8000).allow('', null), methods: Joi.array().items(Joi.string().max(180)).max(20).default([]), startsOn: Joi.date().iso().allow(null), endsOn: Joi.date().iso().allow(null), findings: Joi.string().max(12000).allow('', null), decisionImpact: Joi.string().max(12000).allow('', null), closureMessage: Joi.string().max(12000).allow('', null), status: Joi.string().valid('planning', 'active', 'complete', 'cancelled').default('planning') });
const decisionPackSchema = Joi.object({ strategyId: Joi.string().uuid().allow(null), actionId: Joi.string().uuid().allow(null), sourceType: Joi.string().valid('action', 'dependency', 'risk', 'funding_position', 'decision').required(), sourceId: Joi.string().uuid().required(), ownerId: Joi.string().uuid().allow(null), decisionMakerId: Joi.string().uuid().allow(null), title: Joi.string().max(260).required(), decisionQuestion: Joi.string().max(12000).required(), recommendation: Joi.string().max(12000).allow('', null), options: Joi.array().items(Joi.object({ label: Joi.string().max(240).required(), detail: Joi.string().max(8000).allow('', null) })).max(12).default([]), financialImplications: Joi.string().max(12000).allow('', null), evidenceSummary: Joi.string().max(12000).allow('', null), dueDate: Joi.date().iso().allow(null), status: Joi.string().valid('draft', 'input_requested', 'ready', 'decided', 'closed').default('draft') });
const reviewPackSchema = Joi.object({ strategyId: Joi.string().uuid().allow(null), reportingPeriodId: Joi.string().uuid().allow(null), ownerId: Joi.string().uuid().allow(null), template: Joi.string().valid('weekly_delivery', 'monthly_leadership', 'quarterly_executive', 'partner_coordination').required(), title: Joi.string().max(260).required(), purpose: Joi.string().max(12000).allow('', null), desiredOutcome: Joi.string().max(12000).allow('', null), executiveSummary: Joi.string().max(20000).allow('', null), meetingAt: Joi.date().iso().allow(null), audience: Joi.string().max(240).allow('', null), items: Joi.array().items(Joi.object({ resourceType: Joi.string().valid(...PACK_ITEM_TYPES).required(), resourceId: Joi.string().uuid().required(), category: Joi.string().max(80).allow('', null), note: Joi.string().max(6000).allow('', null), sortOrder: Joi.number().integer().min(0).max(999).default(0) })).max(60).default([]) });
const reviewQuestionSchema = Joi.object({ question: Joi.string().max(6000).required() });
const reviewOutcomeSchema = Joi.object({ resourceType: Joi.string().valid('action', 'project', 'dependency', 'risk', 'decision', 'funding_position', 'partner_commitment').allow(null), resourceId: Joi.string().uuid().allow(null), outcomeType: Joi.string().valid('decision', 'follow_up', 'note').required(), outcome: Joi.string().max(12000).required(), ownerId: Joi.string().uuid().allow(null), dueDate: Joi.date().iso().allow(null) });
const watchSchema = Joi.object({ resourceType: Joi.string().valid('action', 'project', 'decision', 'funding_position', 'review_pack').required(), resourceId: Joi.string().uuid().required(), deliveryPreference: Joi.string().valid('immediate', 'daily_digest', 'weekly_digest').default('daily_digest') });

function plain(record) { return record?.get ? record.get({ plain: true }) : record; }
function validate(schema, body, res) { const { value, error } = schema.validate(body, { abortEarly: false, stripUnknown: true }); if (error) { res.status(422).json({ error: error.message }); return null; } return value; }
function isManager(req) { return MANAGER_ROLES.includes(req.auth?.role); }

async function activeUser(organizationId, userId) {
  if (!userId) return null;
  return User.findOne({ where: { id: userId, organizationId, status: 'active' }, attributes: ['id', 'firstName', 'lastName', 'role'] });
}

async function requireActiveUser(organizationId, userId, res, label = 'user') {
  const user = await activeUser(organizationId, userId);
  if (!user) { res.status(422).json({ error: `The selected ${label} is not an active member of this Council workspace.` }); return null; }
  return user;
}

async function ensureResource(organizationId, resourceType, resourceId) {
  const maps = {
    action: StrategyAction,
    project: CivicProject,
    decision: StrategyDecision,
    dependency: ActionDependency,
    funding_room: FundingCollaborationRoom,
    review_pack: ReviewPack,
    quarterly_update: QuarterlyActionUpdate,
    risk: StrategyRiskIssue,
    funding_position: ActionFundingPosition,
    partner_commitment: PartnerCommitment,
  };
  const Model = maps[resourceType];
  if (!Model) return null;
  return Model.findOne({ where: { id: resourceId, organizationId } });
}

async function activity({ organizationId, resourceType, resourceId, actorId, activityType, summary, metadata = {}, transaction }) {
  return CollaborationActivity.create({ organizationId, resourceType, resourceId, actorId, activityType, summary, metadata }, transaction ? { transaction } : undefined);
}

async function notify({ organizationId, userIds, actorId, resourceType, resourceId, notificationType, title, detail = null, transaction }) {
  const ids = [...new Set((userIds || []).filter((id) => id && id !== actorId))];
  if (!ids.length) return;
  const recipients = await User.findAll({ where: { id: ids, organizationId, status: 'active' }, attributes: ['id'], transaction });
  if (!recipients.length) return;
  await CollaborationNotification.bulkCreate(recipients.map((user) => ({ organizationId, userId: user.id, resourceType, resourceId, notificationType, title, detail })), { transaction });
}

async function audit(req, entityType, entityId, action, metadata = {}, transaction) {
  return recordAudit(req, { entityType, entityId, action, metadata, transaction });
}

export async function getActionCollaboration(req, res, next) {
  try {
    const organizationId = req.tenant.organizationId;
    const action = await StrategyAction.findOne({ where: { id: req.params.actionId, organizationId } });
    if (!action) return res.status(404).json({ error: 'Strategy action not found.' });
    const [participants, threads, requests, activities, commitments, engagementPlans, fundingRooms, watches] = await Promise.all([
      CollaborationParticipant.findAll({ where: { organizationId, resourceType: 'action', resourceId: action.id }, include: [{ model: User, as: 'participantUser', attributes: ['id', 'firstName', 'lastName', 'role'] }], order: [['role', 'ASC'], ['createdAt', 'ASC']] }),
      CollaborationThread.findAll({ where: { organizationId, resourceType: 'action', resourceId: action.id }, include: [{ model: User, as: 'threadAuthor', attributes: ['id', 'firstName', 'lastName'] }, { model: CollaborationComment, include: [{ model: User, as: 'commentAuthor', attributes: ['id', 'firstName', 'lastName'] }], separate: true, order: [['createdAt', 'ASC']] }], order: [['createdAt', 'DESC']], limit: 30 }),
      CollaborationRequest.findAll({ where: { organizationId, resourceType: 'action', resourceId: action.id }, include: [{ model: User, as: 'requestRecipient', attributes: ['id', 'firstName', 'lastName'] }, { model: User, as: 'requester', attributes: ['id', 'firstName', 'lastName'] }], order: [['status', 'ASC'], ['dueDate', 'ASC']] }),
      CollaborationActivity.findAll({ where: { organizationId, resourceType: 'action', resourceId: action.id }, include: [{ model: User, as: 'activityActor', attributes: ['id', 'firstName', 'lastName'] }], order: [['createdAt', 'DESC']], limit: 40 }),
      PartnerCommitment.findAll({ where: { organizationId, actionId: action.id }, include: [{ model: StrategyStakeholder }, { model: User, as: 'commitmentOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['dueDate', 'ASC']] }),
      EngagementPlan.findAll({ where: { organizationId, actionId: action.id }, include: [{ model: User, as: 'engagementOwner', attributes: ['id', 'firstName', 'lastName'] }], order: [['createdAt', 'DESC']] }),
      FundingCollaborationRoom.findAll({ where: { organizationId, actionId: action.id }, include: [{ model: User, as: 'fundingRoomOwner', attributes: ['id', 'firstName', 'lastName'] }, { model: FundingRoomCheckpoint, include: [{ model: User, as: 'checkpointOwner', attributes: ['id', 'firstName', 'lastName'] }], separate: true, order: [['dueDate', 'ASC']] }], order: [['dueDate', 'ASC']] }),
      UserWatch.findAll({ where: { organizationId, resourceType: 'action', resourceId: action.id, isActive: true }, attributes: ['userId', 'deliveryPreference'] }),
    ]);
    return res.json({ data: { participants: participants.map(plain), threads: threads.map(plain), requests: requests.map(plain), activities: activities.map(plain), commitments: commitments.map(plain), engagementPlans: engagementPlans.map(plain), fundingRooms: fundingRooms.map(plain), watching: watches.some((item) => item.userId === req.auth.sub), watcherCount: watches.length } });
  } catch (error) { return next(error); }
}

export async function addActionParticipant(req, res, next) {
  try {
    const value = validate(participantSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const action = await StrategyAction.findOne({ where: { id: req.params.actionId, organizationId } });
    if (!action) return res.status(404).json({ error: 'Strategy action not found.' });
    const user = await requireActiveUser(organizationId, value.userId, res, 'participant'); if (!user) return;
    const [record, created] = await sequelize.transaction(async (transaction) => {
      const result = await CollaborationParticipant.findOrCreate({ where: { organizationId, resourceType: 'action', resourceId: action.id, userId: user.id, role: value.role }, defaults: { addedBy: req.auth.sub }, transaction });
      if (result[1]) await Promise.all([
        activity({ organizationId, resourceType: 'action', resourceId: action.id, actorId: req.auth.sub, activityType: 'participant_added', summary: `${user.firstName} ${user.lastName} added as ${value.role.replace(/_/g, ' ')}.`, metadata: { userId: user.id, role: value.role }, transaction }),
        notify({ organizationId, userIds: [user.id], actorId: req.auth.sub, resourceType: 'action', resourceId: action.id, notificationType: 'assignment', title: 'You were added to an action workspace', detail: action.title, transaction }),
        audit(req, 'collaboration_participant', result[0].id, 'created', { actionId: action.id, userId: user.id, role: value.role }, transaction),
      ]);
      return result;
    });
    return res.status(created ? 201 : 200).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function createActionThread(req, res, next) {
  try {
    const value = validate(threadSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const action = await StrategyAction.findOne({ where: { id: req.params.actionId, organizationId } });
    if (!action) return res.status(404).json({ error: 'Strategy action not found.' });
    for (const userId of value.mentionUserIds) if (!await requireActiveUser(organizationId, userId, res, 'mentioned user')) return;
    const record = await sequelize.transaction(async (transaction) => {
      const created = await CollaborationThread.create({ organizationId, resourceType: 'action', resourceId: action.id, title: value.title || null, body: value.body, mentionUserIds: value.mentionUserIds, createdBy: req.auth.sub }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'action', resourceId: action.id, actorId: req.auth.sub, activityType: 'thread_started', summary: value.title || 'A collaboration note was added.', transaction }),
        notify({ organizationId, userIds: value.mentionUserIds, actorId: req.auth.sub, resourceType: 'action', resourceId: action.id, notificationType: 'mention', title: 'You were mentioned in an action workspace', detail: action.title, transaction }),
        audit(req, 'collaboration_thread', created.id, 'created', { actionId: action.id, mentionCount: value.mentionUserIds.length }, transaction),
      ]);
      return created;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function createThreadComment(req, res, next) {
  try {
    const value = validate(commentSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const thread = await CollaborationThread.findOne({ where: { id: req.params.threadId, organizationId } });
    if (!thread) return res.status(404).json({ error: 'Collaboration thread not found.' });
    for (const userId of value.mentionUserIds) if (!await requireActiveUser(organizationId, userId, res, 'mentioned user')) return;
    const record = await sequelize.transaction(async (transaction) => {
      const created = await CollaborationComment.create({ organizationId, threadId: thread.id, body: value.body, mentionUserIds: value.mentionUserIds, createdBy: req.auth.sub }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: thread.resourceType, resourceId: thread.resourceId, actorId: req.auth.sub, activityType: 'comment_added', summary: 'A reply was added to a collaboration thread.', transaction }),
        notify({ organizationId, userIds: value.mentionUserIds, actorId: req.auth.sub, resourceType: thread.resourceType, resourceId: thread.resourceId, notificationType: 'mention', title: 'You were mentioned in a collaboration reply', transaction }),
        audit(req, 'collaboration_comment', created.id, 'created', { threadId: thread.id, mentionCount: value.mentionUserIds.length }, transaction),
      ]);
      return created;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function createActionRequest(req, res, next) {
  try {
    const value = validate(requestSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const action = await StrategyAction.findOne({ where: { id: req.params.actionId, organizationId } });
    if (!action) return res.status(404).json({ error: 'Strategy action not found.' });
    const recipient = await requireActiveUser(organizationId, value.requestedFromUserId, res, 'request recipient'); if (!recipient) return;
    const record = await sequelize.transaction(async (transaction) => {
      const created = await CollaborationRequest.create({ ...value, organizationId, resourceType: 'action', resourceId: action.id, requestedByUserId: req.auth.sub }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'action', resourceId: action.id, actorId: req.auth.sub, activityType: 'request_created', summary: value.title, metadata: { requestType: value.requestType, recipientId: recipient.id }, transaction }),
        notify({ organizationId, userIds: [recipient.id], actorId: req.auth.sub, resourceType: 'action', resourceId: action.id, notificationType: 'request', title: 'A collaboration request needs your input', detail: value.title, transaction }),
        audit(req, 'collaboration_request', created.id, 'created', { actionId: action.id, requestType: value.requestType, recipientId: recipient.id }, transaction),
      ]);
      return created;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function updateCollaborationRequest(req, res, next) {
  try {
    const value = validate(requestUpdateSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const record = await CollaborationRequest.findOne({ where: { id: req.params.requestId, organizationId } });
    if (!record) return res.status(404).json({ error: 'Collaboration request not found.' });
    if (!isManager(req) && record.requestedFromUserId !== req.auth.sub) return res.status(403).json({ error: 'Only the requested Council member or a workspace manager can update this request.' });
    const completedAt = ['complete', 'declined'].includes(value.status) ? new Date() : null;
    await sequelize.transaction(async (transaction) => {
      await record.update({ ...value, completedAt }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: record.resourceType, resourceId: record.resourceId, actorId: req.auth.sub, activityType: 'request_updated', summary: `${record.title} marked ${value.status.replace(/_/g, ' ')}.`, metadata: { requestId: record.id, status: value.status }, transaction }),
        notify({ organizationId, userIds: [record.requestedByUserId], actorId: req.auth.sub, resourceType: record.resourceType, resourceId: record.resourceId, notificationType: 'request', title: 'A collaboration request was updated', detail: record.title, transaction }),
        audit(req, 'collaboration_request', record.id, 'updated', { status: value.status }, transaction),
      ]);
    });
    return res.json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function createDependencyHandover(req, res, next) {
  try {
    const value = validate(handoverSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const dependency = await ActionDependency.findOne({ where: { id: req.params.dependencyId, organizationId } });
    if (!dependency) return res.status(404).json({ error: 'Dependency not found.' });
    const recipient = await requireActiveUser(organizationId, value.requestedToUserId, res, 'receiving owner'); if (!recipient) return;
    if (recipient.id === req.auth.sub) return res.status(422).json({ error: 'Choose another Council user to receive this handover.' });
    const raci = { responsibleUserId: null, accountableUserId: null, consultedUserIds: [], informedUserIds: [], ...(value.raci || {}) };
    for (const userId of [raci.responsibleUserId, raci.accountableUserId, ...raci.consultedUserIds, ...raci.informedUserIds].filter(Boolean)) if (!await requireActiveUser(organizationId, userId, res, 'RACI participant')) return;
    await sequelize.transaction(async (transaction) => {
      await dependency.update({ handoverRequestedBy: req.auth.sub, handoverRequestedTo: recipient.id, handoverStatus: 'requested', handoverResponse: value.detail || null, dueDate: value.dueDate || dependency.dueDate, raci }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'dependency', resourceId: dependency.id, actorId: req.auth.sub, activityType: 'handover_requested', summary: 'A cross-team handover was requested.', metadata: { recipientId: recipient.id }, transaction }),
        notify({ organizationId, userIds: [recipient.id], actorId: req.auth.sub, resourceType: 'dependency', resourceId: dependency.id, notificationType: 'handover', title: 'A dependency handover needs your response', detail: dependency.detail || null, transaction }),
        audit(req, 'action_dependency', dependency.id, 'handover_requested', { recipientId: recipient.id }, transaction),
      ]);
    });
    return res.json({ data: plain(dependency) });
  } catch (error) { return next(error); }
}

export async function respondDependencyHandover(req, res, next) {
  try {
    const value = validate(handoverResponseSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const dependency = await ActionDependency.findOne({ where: { id: req.params.dependencyId, organizationId } });
    if (!dependency) return res.status(404).json({ error: 'Dependency not found.' });
    if (!isManager(req) && dependency.handoverRequestedTo !== req.auth.sub) return res.status(403).json({ error: 'Only the nominated receiving owner or a workspace manager can respond to this handover.' });
    const patch = { handoverStatus: value.handoverStatus, handoverResponse: value.response || null, proposedDueDate: value.proposedDueDate || null };
    if (value.handoverStatus === 'accepted') patch.ownerId = dependency.handoverRequestedTo;
    await sequelize.transaction(async (transaction) => {
      await dependency.update(patch, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'dependency', resourceId: dependency.id, actorId: req.auth.sub, activityType: 'handover_responded', summary: `Handover ${value.handoverStatus.replace(/_/g, ' ')}.`, metadata: { status: value.handoverStatus }, transaction }),
        notify({ organizationId, userIds: [dependency.handoverRequestedBy], actorId: req.auth.sub, resourceType: 'dependency', resourceId: dependency.id, notificationType: 'handover', title: 'A dependency handover was updated', detail: value.handoverStatus.replace(/_/g, ' '), transaction }),
        audit(req, 'action_dependency', dependency.id, 'handover_responded', { status: value.handoverStatus }, transaction),
      ]);
    });
    return res.json({ data: plain(dependency) });
  } catch (error) { return next(error); }
}

export async function updateQuarterlyWorkflow(req, res, next) {
  try {
    const value = validate(updateWorkflowSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const record = await QuarterlyActionUpdate.findOne({ where: { id: req.params.updateId, organizationId }, include: [{ model: StrategyAction, attributes: ['id', 'title', 'ownerId'] }] });
    if (!record) return res.status(404).json({ error: 'Quarterly update not found.' });
    const actionOwner = record.StrategyAction?.ownerId;
    const canSubmit = req.auth.sub === record.submittedBy || req.auth.sub === actionOwner || isManager(req);
    const canReview = isManager(req) || req.auth.sub === record.reviewRequestedFromUserId;
    if (value.workflowStatus === 'submitted_for_review' && !canSubmit) return res.status(403).json({ error: 'Only the submitting contributor, action owner or workspace manager can submit this update for review.' });
    if (['changes_requested', 'endorsed'].includes(value.workflowStatus) && !canReview) return res.status(403).json({ error: 'Only the nominated reviewer or a workspace manager can review this update.' });
    if (value.workflowStatus === 'included_in_report' && !isManager(req)) return res.status(403).json({ error: 'Only a workspace manager can include an update in the quarterly report.' });
    if (value.workflowStatus === 'submitted_for_review' && !value.reviewRequestedFromUserId) return res.status(422).json({ error: 'Choose an active reviewer before submitting this update.' });
    if (value.reviewRequestedFromUserId && !await requireActiveUser(organizationId, value.reviewRequestedFromUserId, res, 'reviewer')) return;
    const patch = { workflowStatus: value.workflowStatus, reviewComment: value.reviewComment || null };
    if (value.workflowStatus === 'submitted_for_review') patch.reviewRequestedFromUserId = value.reviewRequestedFromUserId;
    if (['changes_requested', 'endorsed', 'included_in_report'].includes(value.workflowStatus)) { patch.reviewedBy = req.auth.sub; patch.reviewedAt = new Date(); }
    if (value.workflowStatus === 'included_in_report') patch.includedInReportAt = new Date();
    const recipients = value.workflowStatus === 'submitted_for_review' ? [value.reviewRequestedFromUserId] : [record.submittedBy];
    await sequelize.transaction(async (transaction) => {
      await record.update(patch, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'quarterly_update', resourceId: record.id, actorId: req.auth.sub, activityType: 'quarterly_workflow_updated', summary: `Quarterly update marked ${value.workflowStatus.replace(/_/g, ' ')}.`, metadata: { actionId: record.actionId, status: value.workflowStatus }, transaction }),
        notify({ organizationId, userIds: recipients, actorId: req.auth.sub, resourceType: 'quarterly_update', resourceId: record.id, notificationType: value.workflowStatus === 'submitted_for_review' ? 'review_requested' : 'request', title: 'A quarterly update workflow changed', detail: record.StrategyAction?.title || null, transaction }),
        audit(req, 'quarterly_action_update', record.id, 'workflow_updated', { workflowStatus: value.workflowStatus }, transaction),
      ]);
    });
    return res.json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function createPartnerCommitment(req, res, next) {
  try {
    const value = validate(commitmentSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const action = await StrategyAction.findOne({ where: { id: req.params.actionId, organizationId } });
    if (!action) return res.status(404).json({ error: 'Strategy action not found.' });
    if (value.ownerId && !await requireActiveUser(organizationId, value.ownerId, res, 'commitment owner')) return;
    if (value.stakeholderId && !await StrategyStakeholder.findOne({ where: { id: value.stakeholderId, organizationId, actionId: action.id } })) return res.status(422).json({ error: 'The selected stakeholder is not linked to this strategy action.' });
    const record = await sequelize.transaction(async (transaction) => {
      const created = await PartnerCommitment.create({ ...value, organizationId, actionId: action.id }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'action', resourceId: action.id, actorId: req.auth.sub, activityType: 'partner_commitment_added', summary: 'A partner commitment was recorded.', metadata: { commitmentId: created.id, type: created.contributionType }, transaction }),
        audit(req, 'partner_commitment', created.id, 'created', { actionId: action.id, contributionType: created.contributionType }, transaction),
      ]);
      return created;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function createFundingRoom(req, res, next) {
  try {
    const value = validate(fundingRoomSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const action = await StrategyAction.findOne({ where: { id: req.params.actionId, organizationId } });
    if (!action) return res.status(404).json({ error: 'Strategy action not found.' });
    if (value.ownerId && !await requireActiveUser(organizationId, value.ownerId, res, 'funding room owner')) return;
    if (value.fundingPositionId && !await ActionFundingPosition.findOne({ where: { id: value.fundingPositionId, organizationId, actionId: action.id } })) return res.status(422).json({ error: 'The selected funding position is not linked to this strategy action.' });
    const record = await sequelize.transaction(async (transaction) => {
      const created = await FundingCollaborationRoom.create({ ...value, organizationId, actionId: action.id }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'action', resourceId: action.id, actorId: req.auth.sub, activityType: 'funding_room_created', summary: 'A funding collaboration room was created.', metadata: { fundingRoomId: created.id }, transaction }),
        audit(req, 'funding_collaboration_room', created.id, 'created', { actionId: action.id }, transaction),
      ]);
      return created;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function createFundingCheckpoint(req, res, next) {
  try {
    const value = validate(checkpointSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const room = await FundingCollaborationRoom.findOne({ where: { id: req.params.roomId, organizationId } });
    if (!room) return res.status(404).json({ error: 'Funding collaboration room not found.' });
    if (value.ownerId && !await requireActiveUser(organizationId, value.ownerId, res, 'checkpoint owner')) return;
    const record = await sequelize.transaction(async (transaction) => {
      const created = await FundingRoomCheckpoint.create({ ...value, organizationId, fundingRoomId: room.id }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'funding_room', resourceId: room.id, actorId: req.auth.sub, activityType: 'funding_checkpoint_created', summary: value.title, metadata: { checkpointId: created.id }, transaction }),
        audit(req, 'funding_room_checkpoint', created.id, 'created', { fundingRoomId: room.id }, transaction),
      ]);
      return created;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function createEngagementPlan(req, res, next) {
  try {
    const value = validate(engagementSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const action = await StrategyAction.findOne({ where: { id: req.params.actionId, organizationId } });
    if (!action) return res.status(404).json({ error: 'Strategy action not found.' });
    if (value.ownerId && !await requireActiveUser(organizationId, value.ownerId, res, 'engagement owner')) return;
    const record = await sequelize.transaction(async (transaction) => {
      const created = await EngagementPlan.create({ ...value, organizationId, actionId: action.id }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'action', resourceId: action.id, actorId: req.auth.sub, activityType: 'engagement_plan_created', summary: `An engagement plan was recorded at the ${created.participationLevel} level.`, metadata: { engagementPlanId: created.id }, transaction }),
        audit(req, 'engagement_plan', created.id, 'created', { actionId: action.id, participationLevel: created.participationLevel }, transaction),
      ]);
      return created;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function createDecisionPack(req, res, next) {
  try {
    const value = validate(decisionPackSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const source = await ensureResource(organizationId, value.sourceType, value.sourceId);
    if (!source) return res.status(422).json({ error: 'The selected decision source is not available in this Council workspace.' });
    if (value.strategyId && !await StrategicPlan.findOne({ where: { id: value.strategyId, organizationId } })) return res.status(422).json({ error: 'The selected strategy is not available in this Council workspace.' });
    if (value.ownerId && !await requireActiveUser(organizationId, value.ownerId, res, 'decision pack owner')) return;
    if (value.decisionMakerId && !await requireActiveUser(organizationId, value.decisionMakerId, res, 'decision-maker')) return;
    if (value.actionId && !await StrategyAction.findOne({ where: { id: value.actionId, organizationId } })) return res.status(422).json({ error: 'The selected action is not available in this Council workspace.' });
    const record = await sequelize.transaction(async (transaction) => {
      const created = await DecisionPack.create({ ...value, organizationId, actionId: value.actionId || (value.sourceType === 'action' ? value.sourceId : null) }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'decision', resourceId: created.id, actorId: req.auth.sub, activityType: 'decision_pack_created', summary: created.title, metadata: { sourceType: value.sourceType, sourceId: value.sourceId }, transaction }),
        audit(req, 'decision_pack', created.id, 'created', { sourceType: value.sourceType, sourceId: value.sourceId }, transaction),
      ]);
      return created;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function getDecisionPack(req, res, next) {
  try {
    const organizationId = req.tenant.organizationId;
    const record = await DecisionPack.findOne({ where: { id: req.params.packId, organizationId }, include: [{ model: StrategyAction, attributes: ['id', 'actionCode', 'title'] }, { model: User, as: 'decisionPackOwner', attributes: ['id', 'firstName', 'lastName'] }, { model: User, as: 'decisionPackDecisionMaker', attributes: ['id', 'firstName', 'lastName'] }] });
    if (!record) return res.status(404).json({ error: 'Decision pack not found.' });
    const [participants, requests, threads, activityRows] = await Promise.all([
      CollaborationParticipant.findAll({ where: { organizationId, resourceType: 'decision', resourceId: record.id }, include: [{ model: User, as: 'participantUser', attributes: ['id', 'firstName', 'lastName', 'role'] }] }),
      CollaborationRequest.findAll({ where: { organizationId, resourceType: 'decision', resourceId: record.id }, include: [{ model: User, as: 'requestRecipient', attributes: ['id', 'firstName', 'lastName'] }] }),
      CollaborationThread.findAll({ where: { organizationId, resourceType: 'decision', resourceId: record.id }, include: [{ model: User, as: 'threadAuthor', attributes: ['id', 'firstName', 'lastName'] }], order: [['createdAt', 'DESC']] }),
      CollaborationActivity.findAll({ where: { organizationId, resourceType: 'decision', resourceId: record.id }, order: [['createdAt', 'DESC']], limit: 30 }),
    ]);
    return res.json({ data: { ...plain(record), participants: participants.map(plain), requests: requests.map(plain), threads: threads.map(plain), activities: activityRows.map(plain) } });
  } catch (error) { return next(error); }
}

export async function createReviewPack(req, res, next) {
  try {
    const value = validate(reviewPackSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    if (value.strategyId && !await StrategicPlan.findOne({ where: { id: value.strategyId, organizationId } })) return res.status(422).json({ error: 'The selected strategy is not available in this Council workspace.' });
    if (value.reportingPeriodId && !await QuarterlyReportingPeriod.findOne({ where: { id: value.reportingPeriodId, organizationId, ...(value.strategyId ? { strategyId: value.strategyId } : {}) } })) return res.status(422).json({ error: 'The selected reporting period is not available for this Council strategy.' });
    if (value.ownerId && !await requireActiveUser(organizationId, value.ownerId, res, 'review pack owner')) return;
    for (const item of value.items) if (!await ensureResource(organizationId, item.resourceType, item.resourceId)) return res.status(422).json({ error: 'Every Review Pack item must be an active Council record.' });
    const record = await sequelize.transaction(async (transaction) => {
      const created = await ReviewPack.create({ organizationId, strategyId: value.strategyId || null, reportingPeriodId: value.reportingPeriodId || null, ownerId: value.ownerId || req.auth.sub, template: value.template, title: value.title, purpose: value.purpose || null, desiredOutcome: value.desiredOutcome || null, executiveSummary: value.executiveSummary || null, meetingAt: value.meetingAt || null, audience: value.audience || null, status: 'draft', internalOnly: true }, { transaction });
      if (value.items.length) await ReviewPackItem.bulkCreate(value.items.map((item) => ({ ...item, organizationId, reviewPackId: created.id })), { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'review_pack', resourceId: created.id, actorId: req.auth.sub, activityType: 'review_pack_created', summary: created.title, metadata: { template: created.template, itemCount: value.items.length, internalOnly: true }, transaction }),
        audit(req, 'review_pack', created.id, 'created', { template: created.template, itemCount: value.items.length, internalOnly: true }, transaction),
      ]);
      return created;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function listReviewPacks(req, res, next) {
  try {
    const where = { organizationId: req.tenant.organizationId };
    if (req.query.strategyId) where.strategyId = req.query.strategyId;
    const records = await ReviewPack.findAll({ where, include: [{ model: User, as: 'reviewPackOwner', attributes: ['id', 'firstName', 'lastName'] }, { model: ReviewPackItem, attributes: ['id'] }], order: [['meetingAt', 'DESC'], ['createdAt', 'DESC']], limit: 60 });
    return res.json({ data: records.map(plain) });
  } catch (error) { return next(error); }
}

export async function getReviewPack(req, res, next) {
  try {
    const organizationId = req.tenant.organizationId;
    const record = await ReviewPack.findOne({ where: { id: req.params.reviewPackId, organizationId }, include: [{ model: User, as: 'reviewPackOwner', attributes: ['id', 'firstName', 'lastName'] }, { model: ReviewPackItem, order: [['sortOrder', 'ASC']] }, { model: ReviewPackQuestion, include: [{ model: User, as: 'questionAuthor', attributes: ['id', 'firstName', 'lastName'] }, { model: User, as: 'questionResponder', attributes: ['id', 'firstName', 'lastName'] }], separate: true, order: [['createdAt', 'ASC']] }, { model: ReviewPackOutcome, include: [{ model: User, as: 'outcomeOwner', attributes: ['id', 'firstName', 'lastName'] }], separate: true, order: [['dueDate', 'ASC']] }] });
    if (!record) return res.status(404).json({ error: 'Review Pack not found.' });
    const [participants, threads, activities] = await Promise.all([
      CollaborationParticipant.findAll({ where: { organizationId, resourceType: 'review_pack', resourceId: record.id }, include: [{ model: User, as: 'participantUser', attributes: ['id', 'firstName', 'lastName', 'role'] }] }),
      CollaborationThread.findAll({ where: { organizationId, resourceType: 'review_pack', resourceId: record.id }, include: [{ model: User, as: 'threadAuthor', attributes: ['id', 'firstName', 'lastName'] }], order: [['createdAt', 'DESC']] }),
      CollaborationActivity.findAll({ where: { organizationId, resourceType: 'review_pack', resourceId: record.id }, order: [['createdAt', 'DESC']], limit: 40 }),
    ]);
    return res.json({ data: { ...plain(record), participants: participants.map(plain), threads: threads.map(plain), activities: activities.map(plain) } });
  } catch (error) { return next(error); }
}

export async function createReviewPackQuestion(req, res, next) {
  try {
    const value = validate(reviewQuestionSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const pack = await ReviewPack.findOne({ where: { id: req.params.reviewPackId, organizationId } });
    if (!pack) return res.status(404).json({ error: 'Review Pack not found.' });
    const record = await sequelize.transaction(async (transaction) => {
      const created = await ReviewPackQuestion.create({ organizationId, reviewPackId: pack.id, askedBy: req.auth.sub, question: value.question }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'review_pack', resourceId: pack.id, actorId: req.auth.sub, activityType: 'review_question_added', summary: 'A pre-reading question was added.', transaction }),
        audit(req, 'review_pack_question', created.id, 'created', { reviewPackId: pack.id }, transaction),
      ]);
      return created;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function createReviewPackOutcome(req, res, next) {
  try {
    const value = validate(reviewOutcomeSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const pack = await ReviewPack.findOne({ where: { id: req.params.reviewPackId, organizationId } });
    if (!pack) return res.status(404).json({ error: 'Review Pack not found.' });
    if (value.ownerId && !await requireActiveUser(organizationId, value.ownerId, res, 'outcome owner')) return;
    if (value.resourceType && !await ensureResource(organizationId, value.resourceType, value.resourceId)) return res.status(422).json({ error: 'The linked outcome record is not available in this Council workspace.' });
    const record = await sequelize.transaction(async (transaction) => {
      const created = await ReviewPackOutcome.create({ ...value, organizationId, reviewPackId: pack.id, recordedBy: req.auth.sub }, { transaction });
      await Promise.all([
        activity({ organizationId, resourceType: 'review_pack', resourceId: pack.id, actorId: req.auth.sub, activityType: 'review_outcome_recorded', summary: value.outcome, metadata: { outcomeType: value.outcomeType, resourceType: value.resourceType, resourceId: value.resourceId }, transaction }),
        value.ownerId ? notify({ organizationId, userIds: [value.ownerId], actorId: req.auth.sub, resourceType: 'review_pack', resourceId: pack.id, notificationType: 'assignment', title: 'A Review Pack follow-up was assigned', detail: value.outcome, transaction }) : Promise.resolve(),
        audit(req, 'review_pack_outcome', created.id, 'created', { reviewPackId: pack.id, outcomeType: value.outcomeType }, transaction),
      ]);
      return created;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function createWatch(req, res, next) {
  try {
    const value = validate(watchSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    if (!await ensureResource(organizationId, value.resourceType, value.resourceId)) return res.status(422).json({ error: 'The selected record is not available in this Council workspace.' });
    const [record] = await sequelize.transaction(async (transaction) => {
      const result = await UserWatch.findOrCreate({ where: { organizationId, userId: req.auth.sub, resourceType: value.resourceType, resourceId: value.resourceId }, defaults: { deliveryPreference: value.deliveryPreference, isActive: true }, transaction });
      if (!result[0].isActive || result[0].deliveryPreference !== value.deliveryPreference) await result[0].update({ deliveryPreference: value.deliveryPreference, isActive: true }, { transaction });
      await audit(req, 'user_watch', result[0].id, 'created_or_updated', { resourceType: value.resourceType, resourceId: value.resourceId, deliveryPreference: value.deliveryPreference }, transaction);
      return result;
    });
    return res.status(201).json({ data: plain(record) });
  } catch (error) { return next(error); }
}

export async function removeWatch(req, res, next) {
  try {
    const record = await UserWatch.findOne({ where: { id: req.params.watchId, organizationId: req.tenant.organizationId, userId: req.auth.sub } });
    if (!record) return res.status(404).json({ error: 'Watch record not found.' });
    await sequelize.transaction(async (transaction) => {
      await record.update({ isActive: false }, { transaction });
      await audit(req, 'user_watch', record.id, 'disabled', {}, transaction);
    });
    return res.status(204).end();
  } catch (error) { return next(error); }
}

export async function getMyCollaborationWork(req, res, next) {
  try {
    const organizationId = req.tenant.organizationId;
    const [requests, notifications, watches, reviewing] = await Promise.all([
      CollaborationRequest.findAll({ where: { organizationId, requestedFromUserId: req.auth.sub, status: ['open', 'changes_requested'] }, include: [{ model: User, as: 'requester', attributes: ['id', 'firstName', 'lastName'] }], order: [['dueDate', 'ASC']] }),
      CollaborationNotification.findAll({ where: { organizationId, userId: req.auth.sub }, order: [['readAt', 'ASC'], ['createdAt', 'DESC']], limit: 50 }),
      UserWatch.findAll({ where: { organizationId, userId: req.auth.sub, isActive: true }, order: [['createdAt', 'DESC']] }),
      QuarterlyActionUpdate.findAll({ where: { organizationId, reviewRequestedFromUserId: req.auth.sub, workflowStatus: 'submitted_for_review' }, include: [{ model: StrategyAction, attributes: ['id', 'title', 'actionCode'] }, { model: User, as: 'updateSubmittedBy', attributes: ['id', 'firstName', 'lastName'] }], order: [['submittedAt', 'ASC']] }),
    ]);
    return res.json({ data: { requests: requests.map(plain), notifications: notifications.map(plain), watches: watches.map(plain), reviews: reviewing.map(plain) } });
  } catch (error) { return next(error); }
}

export async function markNotificationRead(req, res, next) {
  try {
    const record = await CollaborationNotification.findOne({ where: { id: req.params.notificationId, organizationId: req.tenant.organizationId, userId: req.auth.sub } });
    if (!record) return res.status(404).json({ error: 'Notification not found.' });
    await record.update({ readAt: new Date() });
    return res.json({ data: plain(record) });
  } catch (error) { return next(error); }
}
