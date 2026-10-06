import Joi from 'joi';
import { AuditLog, Organization, User } from '../models/index.js';

const profileSchema = Joi.object({
  name: Joi.string().trim().min(2).max(160).required(),
  operatingContactName: Joi.string().trim().max(160).allow('', null),
  operatingContactRole: Joi.string().trim().max(160).allow('', null),
  operatingContactEmail: Joi.string().trim().lowercase().email().max(191).allow('', null),
  workspaceOwnerId: Joi.string().uuid().allow(null),
});

function profileView(organization) {
  return {
    id: organization.id,
    name: organization.name,
    country: organization.country,
    defaultCurrency: organization.defaultCurrency,
    operatingContactName: organization.operatingContactName || '',
    operatingContactRole: organization.operatingContactRole || '',
    operatingContactEmail: organization.operatingContactEmail || '',
    workspaceOwnerId: organization.workspaceOwnerId || null,
    onboardingCompleteAt: organization.onboardingCompleteAt || null,
  };
}

export async function getWorkspaceProfile(req, res, next) {
  try {
    const [organization, members] = await Promise.all([
      Organization.findByPk(req.tenant.organizationId),
      User.findAll({
        where: { organizationId: req.tenant.organizationId, status: 'active', role: ['org_admin', 'portfolio_manager'] },
        attributes: ['id', 'firstName', 'lastName', 'email', 'role'],
        order: [['firstName', 'ASC'], ['lastName', 'ASC']],
      }),
    ]);
    if (!organization) return res.status(404).json({ error: 'Workspace profile not found.' });
    return res.json({ data: { profile: profileView(organization), eligibleOwners: members } });
  } catch (error) { return next(error); }
}

export async function updateWorkspaceProfile(req, res, next) {
  try {
    const { value, error } = profileSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(422).json({ error: 'Please review the workspace profile fields.', details: error.details.map((item) => item.message) });
    const organization = await Organization.findByPk(req.tenant.organizationId);
    if (!organization) return res.status(404).json({ error: 'Workspace profile not found.' });
    if (value.workspaceOwnerId) {
      const owner = await User.findOne({ where: { id: value.workspaceOwnerId, organizationId: organization.id, status: 'active', role: ['org_admin', 'portfolio_manager'] } });
      if (!owner) return res.status(422).json({ error: 'Choose an active Organisation Administrator or Portfolio Manager as workspace owner.' });
    }
    const previouslyComplete = Boolean(organization.onboardingCompleteAt);
    await organization.update({
      ...value,
      onboardingCompleteAt: previouslyComplete ? organization.onboardingCompleteAt : new Date(),
    });
    await AuditLog.create({
      organizationId: organization.id,
      userId: req.auth.sub,
      entityType: 'workspace_profile',
      entityId: organization.id,
      action: 'workspace_profile_updated',
      metadata: { changed: Object.keys(value), workspaceOwnerId: value.workspaceOwnerId || null },
      ipAddress: req.ip,
    });
    return res.json({ data: profileView(organization) });
  } catch (error) { return next(error); }
}
