import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export function requireAuth(req, res, next) {
  const token = req.cookies?.civicpath_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Authentication is required.' });
  try {
    req.auth = jwt.verify(token, env.jwtSecret);
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

export { requireStepUp } from './stepUp.js';
