import Joi from 'joi';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import {
  ActionDependency,
  ActionMilestone,
  CivicProject,
  CouncilInvitation,
  Grant,
  Organization,
  ProductPlan,
  ProjectConstraint,
  StrategyAction,
  StrategyAlert,
  StrategyDecision,
  StrategyRiskIssue,
  StrategyStakeholder,
  StrategicPlan,
  Subscription,
  User,
  WorkItem,
  AuditLog,
} from '../models/index.js';
import { councilInvitationMessage, createSecureToken, hashToken, sendTransactionalEmail } from '../services/accountNotifications.js';
import { env } from '../config/env.js';

const MEMBER_ROLES = ['org_admin', 'portfolio_manager', 'contributor', 'executive'];
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const roleDefinitions = [
  { code: 'org_admin', label: 'Organisation Administrator', description: 'Manages people, roles, billing access and the Council workspace.' },
  { code: 'portfolio_manager', label: 'Portfolio Manager', description: 'Sets up portfolios and strategies, manages reporting periods and coordinates delivery.' },
  { code: 'contributor', label: 'Contributor', description: 'Contributes to delivery work, updates, risks, dependencies, evidence and grant records.' },
  { code: 'executive', label: 'Executive', description: 'Provides read-only visibility of Council delivery, portfolio and reporting information.' },
];
const inviteSchema = Joi.object({
  email: Joi.string().trim().lowercase().email().max(191).required(),
  firstName: Joi.string().trim().min(1).max(80).required(),
  lastName: Joi.string().trim().min(1).max(80).required(),
  role: Joi.string().valid(...MEMBER_ROLES).required(),
});
const roleSchema = Joi.object({ role: Joi.string().valid(...MEMBER_ROLES).required() });
const disableSchema = Joi.object({
  reassignToUserId: Joi.string().uuid().allow(null).default(null),
  reason: Joi.string().trim().min(3).max(500).allow('', null).default(null),
});
const acceptSchema = Joi.object({ token: Joi.string().trim().min(20).max(200).required(), password: Joi.string().min(12).max(200).required() });

function peopleAccessError(message, status = 422) {
  const error = new Error(message);
  error.name = 'PeopleAccessValidationError';
  error.status = status;
  return error;
}

const operationalOwnership = [
  { model: CivicProject, field: 'ownerId', label: 'projects' },
  { model: ProjectConstraint, field: 'ownerId', label: 'project constraints' },
  { model: Grant, field: 'leadId', label: 'grant records' },
  { model: WorkItem, field: 'ownerId', label: 'work items' },
  { model: StrategicPlan, field: 'ownerId', label: 'strategies' },
  { model: StrategyAction, field: 'ownerId', label: 'strategy actions' },
  { model: ActionMilestone, field: 'ownerId', label: 'milestones' },
  { model: ActionDependency, field: 'ownerId', label: 'dependencies' },
  { model: StrategyDecision, field: 'ownerId', label: 'decisions' },
  { model: StrategyStakeholder, field: 'ownerId', label: 'stakeholder records' },
  { model: StrategyRiskIssue, field: 'ownerId', label: 'risks and issues' },
  { model: StrategyAlert, field: 'ownerId', label: 'alerts' },
];

function validate(schema, body, res) {
  const { value, error } = schema.validate(body, { abortEarly: false, stripUnknown: true });
  if (error) { res.status(422).json({ error: error.message }); return null; }
  return value;
}
function invitationUrl(token) {
  return `${new URL('/accept-invitation', env.frontendUrl).toString()}?token=${encodeURIComponent(token)}`;
}
function memberView(member, invitation = null, currentUserId = null) {
  return {
    id: member.id,
    email: member.email,
    firstName: member.firstName,
    lastName: member.lastName,
    role: member.role,
    status: member.status,
    lastLoginAt: member.lastLoginAt,
    createdAt: member.createdAt,
    invitationExpiresAt: invitation?.expiresAt || null,
    isCurrentUser: member.id === currentUserId,
  };
}
async function currentPlan(organizationId, transaction) {
  return Subscription.findOne({
    where: { organizationId, status: 'active' },
    include: [{ model: ProductPlan }],
    order: [['createdAt', 'DESC']],
    transaction,
  }) || Subscription.findOne({
    where: { organizationId },
    include: [{ model: ProductPlan }],
    order: [['createdAt', 'DESC']],
    transaction,
  });
}
async function seatSummary(organizationId, transaction) {
  const subscription = await currentPlan(organizationId, transaction);
  const plan = subscription?.ProductPlan || null;
  const users = await User.findAll({ where: { organizationId, status: { [Op.in]: ['active', 'invited'] } }, attributes: ['role'], transaction });
  const workflowSeatsUsed = users.length;
  const limit = plan?.workflowUserLimit ?? null;
  return {
    planCode: plan?.code || null,
    workflowUserLimit: limit,
    workflowSeatsUsed,
    workflowSeatsAvailable: limit === null ? null : Math.max(0, limit - workflowSeatsUsed),
  };
}
async function enforceSeat(organizationId, role, transaction) {
  const seats = await seatSummary(organizationId, transaction);
  if (seats.workflowUserLimit !== null && seats.workflowSeatsUsed >= seats.workflowUserLimit) {
    const label = seats.planCode ? ` for the ${seats.planCode} plan` : '';
    throw peopleAccessError(`The workspace has reached its ${seats.workflowUserLimit} workflow-user limit${label}. Change the plan or remove access before inviting another workflow user.`);
  }
  return seats;
}
async function createInvitation({ organizationId, member, actorId, transaction }) {
  await CouncilInvitation.destroy({ where: { userId: member.id, consumedAt: null }, force: true, transaction });
  const token = createSecureToken();
  const invitation = await CouncilInvitation.create({
    organizationId,
    userId: member.id,
    invitedBy: actorId,
    email: member.email,
    role: member.role,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
  }, { transaction });
  return { invitation, token };
}
async function audit(req, { organizationId, userId, entityId, action, metadata = {}, transaction }) {
  return AuditLog.create({ organizationId, userId: userId || req.auth?.sub || null, entityType: 'workspace_member', entityId, action, metadata, ipAddress: req.ip }, { transaction });
}
async function activeOrganisationAdminCount(organizationId, transaction) {
  return User.count({ where: { organizationId, role: 'org_admin', status: 'active' }, transaction });
}
async function ownershipSummary(organizationId, userId, transaction) {
  const results = await Promise.all(operationalOwnership.map(async ({ model, field, label }) => ({ label, count: await model.count({ where: { organizationId, [field]: userId }, transaction }) })));
  const records = results.filter((item) => item.count > 0);
  return { records, total: records.reduce((sum, item) => sum + item.count, 0) };
}
async function reassignOperationalOwnership({ organizationId, fromUserId, toUserId, transaction }) {
  const updates = await Promise.all(operationalOwnership.map(async ({ model, field, label }) => {
    const [count] = await model.update({ [field]: toUserId }, { where: { organizationId, [field]: fromUserId }, transaction });
    return { label, count };
  }));
  return updates.filter((item) => item.count > 0);
}
async function findWorkspaceMember(organizationId, userId, transaction, lock = false) {
  return User.findOne({ where: { id: userId, organizationId }, transaction, lock: lock ? transaction.LOCK.UPDATE : undefined });
}

export async function listWorkspaceMembers(req, res, next) {
  try {
    const organizationId = req.tenant.organizationId;
    const [organization, members, invitations, seats] = await Promise.all([
      Organization.findByPk(organizationId, { attributes: ['id', 'name'] }),
      User.findAll({ where: { organizationId, role: { [Op.in]: MEMBER_ROLES } }, attributes: ['id', 'email', 'firstName', 'lastName', 'role', 'status', 'lastLoginAt', 'createdAt'], order: [['role', 'ASC'], ['firstName', 'ASC'], ['lastName', 'ASC']] }),
      CouncilInvitation.findAll({ where: { organizationId, consumedAt: null, expiresAt: { [Op.gt]: new Date() } }, order: [['createdAt', 'DESC']] }),
      seatSummary(organizationId),
    ]);
    const invitationByUser = new Map();
    invitations.forEach((invitation) => { if (!invitationByUser.has(invitation.userId)) invitationByUser.set(invitation.userId, invitation); });
    return res.json({ data: { organization: { id: organization?.id, name: organization?.name }, roles: roleDefinitions, seats, members: members.map((member) => memberView(member, invitationByUser.get(member.id), req.auth.sub)) } });
  } catch (error) { return next(error); }
}

export async function inviteWorkspaceMember(req, res, next) {
  try {
    const value = validate(inviteSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const result = await sequelize.transaction(async (transaction) => {
      let member = await User.findOne({ where: { email: value.email }, transaction, lock: transaction.LOCK.UPDATE });
      if (member && member.organizationId !== organizationId) return { error: 'This work email already belongs to another CivicPath workspace.', status: 409 };
      if (member?.status === 'active') return { error: 'This person already has active access. Change their role instead.', status: 409 };
      if (!member || member.status === 'disabled') await enforceSeat(organizationId, value.role, transaction);
      if (!member) {
        member = await User.create({ organizationId, email: value.email, firstName: value.firstName, lastName: value.lastName, role: value.role, status: 'invited', passwordHash: await bcrypt.hash(createSecureToken(), 12) }, { transaction });
      } else {
        await member.update({ firstName: value.firstName, lastName: value.lastName, role: value.role, status: 'invited', sessionVersion: Number(member.sessionVersion || 0) + 1 }, { transaction });
      }
      const { invitation, token } = await createInvitation({ organizationId, member, actorId: req.auth.sub, transaction });
      await audit(req, { organizationId, entityId: member.id, action: 'member_invited', metadata: { role: member.role, expiresAt: invitation.expiresAt, reinvited: Boolean(member.createdAt && member.status === 'invited') }, transaction });
      const organization = await Organization.findByPk(organizationId, { attributes: ['name'], transaction });
      return { member, invitation, token, organizationName: organization?.name || 'CivicPath' };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    const delivery = await sendTransactionalEmail({ to: result.member.email, message: councilInvitationMessage({ firstName: result.member.firstName, organizationName: result.organizationName, role: result.member.role, invitationUrl: invitationUrl(result.token) }) });
    return res.status(201).json({ data: { member: memberView(result.member, result.invitation, req.auth.sub), delivery: { status: delivery.status } } });
  } catch (error) { return next(error); }
}

export async function updateWorkspaceMemberRole(req, res, next) {
  try {
    const value = validate(roleSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const result = await sequelize.transaction(async (transaction) => {
      const member = await findWorkspaceMember(organizationId, req.params.userId, transaction, true);
      if (!member) return { error: 'Council user not found.', status: 404 };
      if (member.id === req.auth.sub && value.role !== 'org_admin') return { error: 'Ask another Organisation Administrator to change your own administrator access.', status: 422 };
      if (member.role === 'org_admin' && value.role !== 'org_admin' && member.status === 'active' && await activeOrganisationAdminCount(organizationId, transaction) <= 1) return { error: 'Keep at least one active Organisation Administrator. Promote another active user first.', status: 422 };
      if (member.role === value.role) return { member };
      const previousRole = member.role;
      await member.update({ role: value.role, sessionVersion: Number(member.sessionVersion || 0) + 1 }, { transaction });
      await audit(req, { organizationId, entityId: member.id, action: 'member_role_changed', metadata: { from: previousRole, to: value.role }, transaction });
      return { member };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    return res.json({ data: { member: memberView(result.member, null, req.auth.sub) } });
  } catch (error) { return next(error); }
}

export async function getWorkspaceMemberOwnership(req, res, next) {
  try {
    const member = await findWorkspaceMember(req.tenant.organizationId, req.params.userId);
    if (!member) return res.status(404).json({ error: 'Council user not found.' });
    const ownership = await ownershipSummary(req.tenant.organizationId, member.id);
    return res.json({ data: { member: memberView(member, null, req.auth.sub), ownership } });
  } catch (error) { return next(error); }
}

export async function disableWorkspaceMember(req, res, next) {
  try {
    const value = validate(disableSchema, req.body, res); if (!value) return;
    const organizationId = req.tenant.organizationId;
    const result = await sequelize.transaction(async (transaction) => {
      const member = await findWorkspaceMember(organizationId, req.params.userId, transaction, true);
      if (!member) return { error: 'Council user not found.', status: 404 };
      if (member.id === req.auth.sub) return { error: 'For account continuity, another Organisation Administrator must remove your own access.', status: 422 };
      if (member.status === 'disabled') return { member, reassigned: [] };
      if (member.role === 'org_admin' && member.status === 'active' && await activeOrganisationAdminCount(organizationId, transaction) <= 1) return { error: 'Keep at least one active Organisation Administrator. Promote another active user first.', status: 422 };
      const ownership = await ownershipSummary(organizationId, member.id, transaction);
      let replacement = null;
      if (value.reassignToUserId) {
        replacement = await findWorkspaceMember(organizationId, value.reassignToUserId, transaction, true);
        if (!replacement || replacement.status !== 'active' || replacement.id === member.id) return { error: 'Choose another active council user to receive the reassigned work.', status: 422 };
      }
      if (ownership.total && !replacement) return { error: 'Reassign the member’s active work before removing access.', status: 422, ownership };
      const reassigned = replacement ? await reassignOperationalOwnership({ organizationId, fromUserId: member.id, toUserId: replacement.id, transaction }) : [];
      await CouncilInvitation.destroy({ where: { userId: member.id, consumedAt: null }, force: true, transaction });
      await member.update({ status: 'disabled', sessionVersion: Number(member.sessionVersion || 0) + 1 }, { transaction });
      await audit(req, { organizationId, entityId: member.id, action: 'member_access_removed', metadata: { reason: value.reason || null, reassignedToUserId: replacement?.id || null, reassigned }, transaction });
      return { member, reassigned };
    });
    if (result.error) return res.status(result.status).json({ error: result.error, ownership: result.ownership });
    return res.json({ data: { member: memberView(result.member, null, req.auth.sub), reassigned: result.reassigned } });
  } catch (error) { return next(error); }
}

export async function resendWorkspaceInvitation(req, res, next) {
  try {
    const organizationId = req.tenant.organizationId;
    const result = await sequelize.transaction(async (transaction) => {
      const member = await findWorkspaceMember(organizationId, req.params.userId, transaction, true);
      if (!member) return { error: 'Council user not found.', status: 404 };
      if (member.status !== 'invited') return { error: 'Only pending invitations can be resent. Re-invite a removed user from the form if access should be restored.', status: 422 };
      const { invitation, token } = await createInvitation({ organizationId, member, actorId: req.auth.sub, transaction });
      await audit(req, { organizationId, entityId: member.id, action: 'member_invitation_resent', metadata: { expiresAt: invitation.expiresAt }, transaction });
      const organization = await Organization.findByPk(organizationId, { attributes: ['name'], transaction });
      return { member, invitation, token, organizationName: organization?.name || 'CivicPath' };
    });
    if (result.error) return res.status(result.status).json({ error: result.error });
    const delivery = await sendTransactionalEmail({ to: result.member.email, message: councilInvitationMessage({ firstName: result.member.firstName, organizationName: result.organizationName, role: result.member.role, invitationUrl: invitationUrl(result.token) }) });
    return res.json({ data: { member: memberView(result.member, result.invitation, req.auth.sub), delivery: { status: delivery.status } } });
  } catch (error) { return next(error); }
}

async function invitationForToken(token) {
  return CouncilInvitation.findOne({ where: { tokenHash: hashToken(token), consumedAt: null, expiresAt: { [Op.gt]: new Date() } }, include: [{ model: User }, { model: Organization, attributes: ['name'] }] });
}
export async function getInvitationAcceptance(req, res, next) {
  try {
    const token = String(req.query.token || '');
    if (token.length < 20) return res.status(422).json({ error: 'This invitation link is invalid or has expired.' });
    const invitation = await invitationForToken(token);
    if (!invitation?.User || invitation.User.status !== 'invited') return res.status(422).json({ error: 'This invitation link is invalid or has expired.' });
    return res.json({ data: { firstName: invitation.User.firstName, lastName: invitation.User.lastName, email: invitation.User.email, role: invitation.role, organizationName: invitation.Organization?.name || 'CivicPath workspace', expiresAt: invitation.expiresAt } });
  } catch (error) { return next(error); }
}

export async function acceptInvitation(req, res, next) {
  try {
    const value = validate(acceptSchema, req.body, res); if (!value) return;
    const result = await sequelize.transaction(async (transaction) => {
      const invitation = await CouncilInvitation.findOne({ where: { tokenHash: hashToken(value.token), consumedAt: null, expiresAt: { [Op.gt]: new Date() } }, include: [{ model: User }, { model: Organization, attributes: ['name'] }], transaction, lock: transaction.LOCK.UPDATE });
      if (!invitation?.User || invitation.User.status !== 'invited') return null;
      await invitation.User.update({ passwordHash: await bcrypt.hash(value.password, 12), status: 'active', sessionVersion: Number(invitation.User.sessionVersion || 0) + 1 }, { transaction });
      await invitation.update({ consumedAt: new Date() }, { transaction });
      await CouncilInvitation.destroy({ where: { userId: invitation.User.id, id: { [Op.ne]: invitation.id }, consumedAt: null }, force: true, transaction });
      await AuditLog.create({ organizationId: invitation.organizationId, userId: invitation.User.id, entityType: 'workspace_member', entityId: invitation.User.id, action: 'member_invitation_accepted', metadata: { role: invitation.role, invitedBy: invitation.invitedBy }, ipAddress: req.ip }, { transaction });
      return { user: invitation.User, organizationName: invitation.Organization?.name || 'CivicPath workspace' };
    });
    if (!result) return res.status(422).json({ error: 'This invitation link is invalid or has expired.' });
    return res.json({ data: { accepted: true, organizationName: result.organizationName } });
  } catch (error) { return next(error); }
}
