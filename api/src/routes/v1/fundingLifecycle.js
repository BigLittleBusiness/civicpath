import { Router } from 'express';
import { requireAuth, tenantScope, requireActiveEntitlement } from '../../middleware/auth.js';
import { fundingLifecycleHandlers as handlers } from '../../controllers/fundingLifecycleController.js';

// Mount at /v1 before the legacy funding-pathways/grants routes. This router has
// its own auth/tenant/entitlement gates, and controllers recheck current DB roles.
export function createFundingLifecycleRouter({ middleware = [requireAuth, tenantScope, requireActiveEntitlement], controllers = handlers } = {}) {
  const router = Router();
  router.use(...middleware);
  router.get('/funding-lifecycle/options', controllers.options);
  for (const [path, singular, plural] of [['funding-pathways', 'Pathway', 'Pathways'], ['grants', 'Grant', 'Grants']]) {
    router.get(`/${path}/export.csv`, controllers[`export${plural}`]);
    router.get(`/${path}`, controllers[`list${plural}`]);
    router.post(`/${path}`, controllers[`create${singular}`]);
    router.get(`/${path}/:id`, controllers[`get${singular}`]);
    router.patch(`/${path}/:id`, controllers[`update${singular}`]);
    router.post(`/${path}/:id/archive`, controllers[`archive${singular}`]);
    router.post(`/${path}/:id/reactivate`, controllers[`reactivate${singular}`]);
  }
  router.get('/grants/:id/history', controllers.grantHistory);
  return router;
}
export const fundingLifecycleRouter = createFundingLifecycleRouter();
