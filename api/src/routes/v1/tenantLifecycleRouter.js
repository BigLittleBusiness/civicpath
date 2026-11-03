import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireStepUp } from '../../middleware/stepUp.js';
import { requireAuth } from '../../middleware/auth.js';
import { tenantLifecycleController } from '../../controllers/tenantLifecycleController.js';

const roleGuard = (...roles) => (req, res, next) => roles.includes(req.auth?.role) ? next() : res.status(403).json({ error: 'You do not have permission to use these tenant data controls.', code: 'forbidden' });
export function createTenantLifecycleRouters({ auth = requireAuth, controller = tenantLifecycleController } = {}) {
  const tenantRouter = express.Router(); const platformRouter = express.Router();
  const setup = (router, roles) => {
    router.use(auth, roleGuard(...roles));
    router.use(rateLimit({ windowMs: 60000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false,
      message: { error: 'Too many tenant data requests. Please wait a minute.', code: 'lifecycle_rate_limit' } }));
    router.use(express.json({ limit: '6kb', strict: true }));
    router.use((req, res, next) => {
      if (Number(req.headers['content-length'] || 0) > 6144) return res.status(413).json({ error: 'Request too large.', code: 'request_too_large' });
      return next();
    });
  };
  setup(tenantRouter, ['org_admin', 'executive']);
  tenantRouter.get('/', controller.status);
  tenantRouter.post('/requests', roleGuard('org_admin'), controller.request);
  tenantRouter.post('/attachment-requests', roleGuard('org_admin'), controller.attachmentRequest);
  tenantRouter.post('/exports', roleGuard('org_admin'), controller.createExport);
  tenantRouter.get('/exports/:exportId', roleGuard('org_admin'), controller.exportStatus);
  tenantRouter.get('/exports/:exportId/download', roleGuard('org_admin'), controller.download);
  setup(platformRouter, ['platform_admin']);
  platformRouter.get('/:organizationId', controller.platformStatus);
  platformRouter.post('/:organizationId/requests/:requestId/review', requireStepUp, controller.review);
  for (const router of [tenantRouter, platformRouter]) router.use((error, _req, res, next) => {
    if (error?.type === 'entity.too.large') return res.status(413).json({ error: 'Request too large.', code: 'request_too_large' });
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON.', code: 'invalid_json' });
    return next(error);
  });
  return { tenantRouter, platformRouter };
}
const routers = createTenantLifecycleRouters();
export const tenantLifecycleRouter = routers.tenantRouter;
export const tenantLifecycleAdminRouter = routers.platformRouter;
export default tenantLifecycleRouter;
