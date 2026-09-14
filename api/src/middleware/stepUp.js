import { env } from '../config/env.js';

export function requireStepUp(req, res, next) {
  const elevatedAt = Number(req.auth?.elevatedAt || 0);
  const ttlMs = env.privilegedActionMinutes * 60 * 1000;
  if (!elevatedAt || Date.now() - elevatedAt > ttlMs) return res.status(428).json({ error: 'Fresh password and authenticator verification is required before this action.', code: 'STEP_UP_REQUIRED' });
  return next();
}
