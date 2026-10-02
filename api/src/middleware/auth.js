import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Subscription, User } from '../models/index.js';

export async function requireAuth(req, res, next) {
  const token = req.cookies?.civicpath_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication is required.' });
  try {
    req.auth = jwt.verify(token, env.jwtSecret);
    const user = await User.findByPk(req.auth.sub, { attributes: ['id', 'status', 'sessionVersion'] });
    if (!user || user.status !== 'active' || Number(req.auth.sessionVersion || 0) !== Number(user.sessionVersion || 0)) return res.status(401).json({ error: 'Your session is no longer valid. Please sign in again.' });
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session is no longer valid. Please sign in again.' });
  }
}

export function requireMfaPending(req, res, next) {
  const token = req.cookies?.civicpath_mfa_pending;
  if (!token) return res.status(401).json({ error: 'A pending MFA session is required.' });
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (payload.scope !== 'mfa_pending') throw new Error('Invalid pending MFA scope');
    req.auth = payload;
    return next();
  } catch {
    return res.status(401).json({ error: 'Your MFA session is no longer valid. Please sign in again.' });
  }
}

export function requireRoles(...roles) {
  return (req, res, next) => roles.includes(req.auth?.role)
    ? next()
    : res.status(403).json({ error: 'You do not have permission to complete this action.' });
}

export function tenantScope(req, _res, next) {
  req.tenant = { organizationId: req.auth.organizationId };
  next();
}

export async function requireActiveEntitlement(req, res, next) {
  try {
    if (req.auth?.role === 'platform_admin') return next();
    const subscription = await Subscription.findOne({ where: { organizationId: req.auth.organizationId, status: 'active' }, order: [['createdAt', 'DESC']] }) || await Subscription.findOne({ where: { organizationId: req.auth.organizationId }, order: [['createdAt', 'DESC']] });
    const current = subscription?.status === 'active' && (!subscription.endsAt || new Date(subscription.endsAt) > new Date());
    if (!current) return res.status(402).json({ error: 'This CivicPath workspace is not currently active. Please contact your organisation administrator or use the billing form.', code: 'subscription_access_required' });
    return next();
  } catch {
    return res.status(401).json({ error: 'Your access could not be confirmed. Please sign in again.' });
  }
}

export { requireStepUp } from './stepUp.js';
