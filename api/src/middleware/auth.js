import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Organization, Subscription, User } from '../models/index.js';
import { createTenantAuthentication } from '../services/tenantAuthentication.js';

const authentication = createTenantAuthentication({
  verifyToken: (token) => jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }),
  Organization,
  Subscription,
  User,
});

export const { requireAuth, requireMfaPending, requireRoles, tenantScope, requireActiveEntitlement } = authentication;
export { createTenantAuthentication } from '../services/tenantAuthentication.js';
export { requireStepUp } from './stepUp.js';
