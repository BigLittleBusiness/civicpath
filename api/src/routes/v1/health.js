import { Router } from 'express';
import { createHealthController } from '../../controllers/healthController.js';

// Mount at /api/v1/health before the authenticated tenant routes.
// Parent supplies a service using its existing Sequelize singleton; no second pool is created.
export function createHealthRouter({ service, middleware = [] }) {
  const router = Router();
  const controller = createHealthController(service);
  if (middleware.length) router.use(...middleware);
  router.get('/live', controller.live);
  router.get('/ready', controller.ready);
  // Compatibility alias now probes readiness instead of asserting static health.
  router.get('/', controller.ready);
  return router;
}
