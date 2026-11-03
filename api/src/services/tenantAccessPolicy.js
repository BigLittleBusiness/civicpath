// Keep this module free of models/config so security decisions can be tested without a DB.
export const TENANT_ACCESS_STATES = Object.freeze(['trial', 'active']);
export const TENANT_ROLES = Object.freeze(['org_admin', 'portfolio_manager', 'contributor', 'executive']);
export const TENANT_UNAVAILABLE = Object.freeze({
  error: 'This CivicPath workspace is unavailable. Please contact your organisation administrator.',
  code: 'tenant_access_unavailable',
});
export const PLATFORM_TENANT_DENIED = Object.freeze({
  error: 'Platform administrators must use platform operations, not council workspace APIs.',
  code: 'platform_tenant_access_denied',
});

function version(value) {
  // Accept numeric DB values, but never coerce a missing/malformed JWT version to zero.
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+$/.test(value)) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

export function sessionMatchesUser(payload, user, { pending = false } = {}) {
  if (!payload || !user || user.status !== 'active' || user.deletedAt) return false;
  if (!payload.sub || payload.sub !== user.id || !user.organizationId
    || payload.organizationId !== user.organizationId || payload.role !== user.role) return false;
  const claimedVersion = version(payload.sessionVersion);
  const currentVersion = version(user.sessionVersion);
  if (claimedVersion === null || currentVersion === null || claimedVersion !== currentVersion) return false;
  if (pending) {
    return user.role === 'platform_admin' && payload.scope === 'mfa_pending'
      && ['setup', 'login'].includes(payload.purpose);
  }
  // A pending-MFA token in the Authorization header must never become a full session.
  if (payload.scope && payload.scope !== 'session') return false;
  if (!TENANT_ROLES.includes(user.role) && user.role !== 'platform_admin') return false;
  // Legacy platform sessions are accepted only if the authoritative account has MFA enabled.
  return user.role !== 'platform_admin' || Boolean(user.mfaEnabled);
}

export function organizationAccessDecision(user, organization, { audience = 'tenant' } = {}) {
  if (!user || !organization || organization.deletedAt || organization.id !== user.organizationId) {
    return { allowed: false, status: 403, ...TENANT_UNAVAILABLE };
  }
  // Platform identity is allowed to recover/manage customer operations, including legacy
  // admins attached to a suspended council. This is NEVER a tenant data entitlement.
  if (user.role === 'platform_admin') {
    if (audience === 'operations' || audience === 'authentication') return { allowed: true, operationsOnly: true };
    return { allowed: false, status: 403, ...PLATFORM_TENANT_DENIED };
  }
  if (!TENANT_ROLES.includes(user.role)) return { allowed: false, status: 403, error: 'You do not have permission to complete this action.' };
  if (audience === 'operations') return { allowed: false, status: 403, error: 'You do not have permission to complete this action.' };
  // Fail closed for suspended, closed, inactive, deleted, unknown and null states.
  if (!TENANT_ACCESS_STATES.includes(organization.status)) return { allowed: false, status: 403, ...TENANT_UNAVAILABLE };
  return { allowed: true, operationsOnly: false };
}

export function requestAudience(req) {
  // Express baseUrl is set by the server's mounted routers, not a query/header supplied
  // by the client. Exact boundaries prevent /admin-like tenant routes from bypassing.
  if (req.baseUrl === '/v1/admin') return 'operations';
  if (req.baseUrl === '/v1/auth' && ['/me', '/step-up'].includes(req.path)) return 'authentication';
  return 'tenant';
}

export function authoritativeAuth(payload, user) {
  return {
    sub: user.id,
    organizationId: user.organizationId,
    role: user.role,
    sessionVersion: Number(user.sessionVersion),
    ...(payload.scope ? { scope: payload.scope } : {}),
    ...(payload.purpose ? { purpose: payload.purpose } : {}),
    elevatedAt: Number.isFinite(payload.elevatedAt) && payload.elevatedAt > 0 && payload.elevatedAt <= Date.now()
      ? payload.elevatedAt : null,
  };
}

export function subscriptionIsCurrent(subscription, now = new Date()) {
  return Boolean(subscription?.status === 'active'
    && (!subscription.endsAt || new Date(subscription.endsAt).getTime() > now.getTime()));
}

export function assertPlatformActor(auth, { now = Date.now(), privilegedActionMinutes = 10, stepUp = false } = {}) {
  if (!auth?.sub || !auth.organizationId || auth.role !== 'platform_admin') {
    const error = new Error('You do not have permission to complete this action.');
    error.status = 403;
    throw error;
  }
  if (stepUp) {
    const elevatedAt = auth.elevatedAt;
    if (!Number.isFinite(elevatedAt) || elevatedAt <= 0 || elevatedAt > now
      || now - elevatedAt > privilegedActionMinutes * 60 * 1000) {
      const error = new Error('Fresh password and authenticator verification is required before this action.');
      error.status = 428;
      error.code = 'STEP_UP_REQUIRED';
      throw error;
    }
  }
}
