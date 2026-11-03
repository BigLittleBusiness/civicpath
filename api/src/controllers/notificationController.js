import { authorizeNotificationUser, validatePreferences, validateOrgPolicy, notificationError, UUID_PATTERN, strictObject } from '../services/notificationPolicy.js';

export function createNotificationController({ repository }) {
  const scope = async (req, write = false) => {
    if (!req.auth?.sub) throw notificationError('Authentication is required.', 401);
    const context = await repository.context(req.auth.organizationId, req.auth.sub);
    return { ...context, ...authorizeNotificationUser(context.user, context.organization, req.auth, write) };
  };
  const handle = (handler) => async (req, res, next) => {
    try { return await handler(req, res); } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      return next(error);
    }
  };
  return {
    getPreferences: handle(async (req, res) => {
      const context = await scope(req);
      return res.json({ data: { preferences: context.preferences, policy: context.policy, canEdit: ['org_admin', 'portfolio_manager', 'contributor'].includes(context.user.role), providerConfigured: await repository.providerConfigured() } });
    }),
    updatePreferences: handle(async (req, res) => {
      const context = await scope(req, true);
      const value = validatePreferences(req.body);
      const result = await repository.updatePreferences({ scope: context, auth: req.auth, value });
      return res.json({ data: result });
    }),
    getPolicy: handle(async (req, res) => {
      const context = await scope(req);
      if (context.user.role !== 'org_admin') throw notificationError('Only organisation administrators can view organisation notification policy.', 403);
      return res.json({ data: context.policy });
    }),
    updatePolicy: handle(async (req, res) => {
      const context = await scope(req, true);
      if (context.user.role !== 'org_admin') throw notificationError('Only organisation administrators can change organisation notification policy.', 403);
      const value = validateOrgPolicy(req.body);
      return res.json({ data: await repository.updatePolicy({ scope: context, auth: req.auth, value }) });
    }),
    listInbox: handle(async (req, res) => {
      const context = await scope(req);
      strictObject(req.query || {}, ['limit', 'cursor', 'unread']);
      const limit = req.query.limit === undefined ? 20 : Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50 || (req.query.unread !== undefined && !['true', 'false'].includes(req.query.unread))) throw notificationError('Invalid inbox filter.');
      const cursor = repository.decodeCursor(req.query.cursor);
      return res.json({ data: await repository.listInbox({ scope: context, limit, cursor, unread: req.query.unread === 'true' }) });
    }),
    markRead: handle(async (req, res) => {
      const context = await scope(req, true);
      if (!UUID_PATTERN.test(String(req.params.id))) throw notificationError('Invalid notification ID.');
      strictObject(req.body || {}, []);
      const result = await repository.markRead({ scope: context, auth: req.auth, id: req.params.id });
      if (!result) throw notificationError('Notification not found.', 404);
      return res.json({ data: result });
    }),
    listDelivery: handle(async (req, res) => {
      const context = await scope(req);
      if (context.user.role !== 'org_admin') throw notificationError('Only organisation administrators can view delivery outcomes.', 403);
      strictObject(req.query || {}, ['limit']);
      const limit = req.query.limit === undefined ? 25 : Number(req.query.limit);
      if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw notificationError('Invalid outcome limit.');
      return res.json({ data: await repository.listDelivery({ scope: context, limit }) });
    }),
  };
}
