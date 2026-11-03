import { literal } from 'sequelize';
import { CouncilInvitation, TenantStateEvent, User } from '../models/index.js';
import { LifecycleError } from './tenantLifecyclePolicy.mjs';

// Called only inside a managed transaction with the organization and lifecycle state row locked.
// This ends access, NOT ownership or retention; no strategy/project/grant/support/object rows are deleted.
export async function closeTenantWorkspaceAccess({ organization, state, now = Date.now(), transaction }) {
  if (!transaction) throw new LifecycleError('transaction_required', 500);
  if (state.holdActive) throw new LifecycleError('legal_hold_blocks_closure', 409);
  if (state.closedAt) throw new LifecycleError('workspace_already_closed', 409);
  const fromStatus = organization.status;
  await organization.update({ status: 'suspended' }, { transaction });
  await User.update({ status: 'disabled', sessionVersion: literal('session_version + 1') }, { where: { organizationId: organization.id }, transaction });
  await CouncilInvitation.update({ consumedAt: new Date(now) }, { where: { organizationId: organization.id, consumedAt: null }, transaction });
  await state.update({ closedAt: new Date(now) }, { transaction });
  await TenantStateEvent.create({ organizationId: organization.id, fromStatus, toStatus: 'suspended', reason: 'Verified lifecycle closure approval: access closed; data preserved pending leadership retention policy.', actorId: null }, { transaction });
}
