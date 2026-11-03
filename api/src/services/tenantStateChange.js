import { assertPlatformActor } from './tenantAccessPolicy.js';

export const MANUAL_TENANT_STATES = Object.freeze(['trial', 'active', 'suspended']);
export function councilOrganisationTypes(demoMode = false) {
  return demoMode ? ['council', 'joint_organisation', 'demo'] : ['council', 'joint_organisation'];
}
function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

export function createTenantStateChanger({ sequelize, Organization, User, TenantStateEvent, AuditLog, demoMode = false, privilegedActionMinutes = 10 }) {
  return async function changeTenantState({ actor, customerId, status, reason, ipAddress }) {
    assertPlatformActor(actor, { stepUp: true, privilegedActionMinutes });
    if (typeof customerId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(customerId)) fail(422, 'A valid customer organisation ID is required.');
    if (!MANUAL_TENANT_STATES.includes(status)) fail(422, 'That tenant state is not available.');
    if (typeof reason !== 'string' || reason.trim().length < 8 || reason.length > 1000) fail(422, 'A reason of 8 to 1000 characters is required.');
    // Free-text request reasons can contain pasted credentials. Never put that input
    // into operational/audit logs. Persist a controlled description and actor instead.
    const eventReason = 'Manual tenant state change approved by a platform administrator.';
    return sequelize.transaction(async (transaction) => {
      const customer = await Organization.findOne({
        where: { id: customerId, organisationType: councilOrganisationTypes(demoMode) },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      if (!customer) fail(404, 'Customer organisation not found.');
      if (customer.isDemo || customer.organisationType === 'demo') fail(422, 'Demonstration tenants cannot have their state changed.');
      if (customer.status === status) fail(422, 'The tenant is already in that state.');
      const fromStatus = customer.status;
      await customer.update({ status }, { transaction });
      // Increment on suspension AND restoration (and any state change). Restoring a
      // tenant cannot resurrect cookies issued before or during suspension. This
      // includes legacy platform users attached to a council and pending MFA tokens.
      await User.increment('sessionVersion', { where: { organizationId: customer.id }, by: 1, transaction });
      await TenantStateEvent.create({ organizationId: customer.id, fromStatus, toStatus: status, reason: eventReason, actorId: actor.sub }, { transaction });
      await AuditLog.create({
        organizationId: actor.organizationId,
        userId: actor.sub,
        entityType: 'customer_tenant',
        entityId: customer.id,
        action: 'tenant_state_changed',
        metadata: { customerId: customer.id, fromStatus, toStatus: status, sessionsInvalidated: true },
        ipAddress,
      }, { transaction });
      return { id: customer.id, status };
    });
  };
}
