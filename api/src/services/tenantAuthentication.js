import { authoritativeAuth, organizationAccessDecision, requestAudience, sessionMatchesUser, subscriptionIsCurrent, PLATFORM_TENANT_DENIED } from './tenantAccessPolicy.js';

const USER_ATTRIBUTES = ['id', 'organizationId', 'role', 'status', 'sessionVersion', 'mfaEnabled'];
const ORGANIZATION_ATTRIBUTES = ['id', 'status', 'organisationType'];
const invalidSession = { error: 'Your session is no longer valid. Please sign in again.' };
const invalidPending = { error: 'Your MFA session is no longer valid. Please sign in again.' };
function deny(res, decision) {
  return res.status(decision.status).json({ error: decision.error, ...(decision.code ? { code: decision.code } : {}) });
}

// Dependency injection is intentional: unit tests run this production path without
// importing env.js, opening a connection, or requiring a database fixture.
export function createTenantAuthentication({ verifyToken, User, Organization, Subscription }) {
  async function authenticate(req, res, next, pending) {
    const token = pending ? req.cookies?.civicpath_mfa_pending
      : req.cookies?.civicpath_session || req.headers?.authorization?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: pending ? 'A pending MFA session is required.' : 'Authentication is required.' });
    try {
      const payload = verifyToken(token);
      const user = await User.findByPk(payload.sub, { attributes: USER_ATTRIBUTES });
      if (!sessionMatchesUser(payload, user, { pending })) return res.status(401).json(pending ? invalidPending : invalidSession);
      const organization = await Organization.findByPk(user.organizationId, { attributes: ORGANIZATION_ATTRIBUTES });
      const audience = pending ? 'authentication' : requestAudience(req);
      const decision = organizationAccessDecision(user, organization, { audience });
      if (!decision.allowed) return deny(res, decision);
      req.auth = authoritativeAuth(payload, user);
      req.access = { operationsOnly: decision.operationsOnly, organizationStatus: organization.status };
    } catch {
      return res.status(401).json(pending ? invalidPending : invalidSession);
    }
    return next();
  }

  const requireAuth = (req, res, next) => authenticate(req, res, next, false);
  const requireMfaPending = (req, res, next) => authenticate(req, res, next, true);

  function requireRoles(...roles) {
    return (req, res, next) => roles.includes(req.auth?.role)
      ? next() : res.status(403).json({ error: 'You do not have permission to complete this action.' });
  }

  function tenantScope(req, res, next) {
    if (!req.auth?.organizationId) return res.status(401).json({ error: 'Authentication is required.' });
    if (req.auth.role === 'platform_admin' && requestAudience(req) !== 'operations') {
      return res.status(403).json(PLATFORM_TENANT_DENIED);
    }
    if (req.auth.role === 'executive' && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return res.status(403).json({ error: 'Executive workspace access is read-only.', code: 'read_only_role' });
    }
    // Never accept a tenant scope from headers, query parameters or the request body.
    req.tenant = { organizationId: req.auth.organizationId };
    return next();
  }

  async function requireActiveEntitlement(req, res, next) {
    try {
      if (!req.auth?.sub) return res.status(401).json({ error: 'Authentication is required.' });
      // Never let a platform administrator's active home tenant/subscription act as
      // a customer entitlement. Recheck tenant state before querying subscriptions.
      const organization = await Organization.findByPk(req.auth.organizationId, { attributes: ORGANIZATION_ATTRIBUTES });
      const decision = organizationAccessDecision({ organizationId: req.auth.organizationId, role: req.auth.role }, organization);
      if (!decision.allowed) return deny(res, decision);
      const subscription = await Subscription.findOne({ where: { organizationId: req.auth.organizationId, status: 'active' }, order: [['createdAt', 'DESC']] })
        || await Subscription.findOne({ where: { organizationId: req.auth.organizationId }, order: [['createdAt', 'DESC']] });
      if (!subscriptionIsCurrent(subscription)) {
        return res.status(402).json({ error: 'This CivicPath workspace is not currently active. Please contact your organisation administrator or use the billing form.', code: 'subscription_access_required' });
      }
    } catch {
      return res.status(401).json({ error: 'Your access could not be confirmed. Please sign in again.' });
    }
    return next();
  }

  return { requireAuth, requireMfaPending, requireRoles, tenantScope, requireActiveEntitlement };
}
