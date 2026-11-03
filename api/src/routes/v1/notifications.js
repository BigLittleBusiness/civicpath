import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../../middleware/auth.js';
import { createNotificationController } from '../../controllers/notificationController.js';
import { createNotificationRepository, applyVerifiedNotificationFeedback } from '../../services/notificationRepository.js';
import { createPinnedSnsVerifier } from '../../services/notificationFeedback.js';

export function createNotificationRouter({ authenticate = requireAuth, repository = createNotificationRepository() } = {}) {
  const router = express.Router(); const controller = createNotificationController({ repository });
  router.use(authenticate);
  router.use(rateLimit({ windowMs: 60000, limit: 90, standardHeaders: 'draft-8', legacyHeaders: false }));
  router.get('/preferences', controller.getPreferences);
  router.put('/preferences', express.json({ limit: '4kb' }), controller.updatePreferences);
  router.get('/policy', controller.getPolicy);
  router.put('/policy', express.json({ limit: '4kb' }), controller.updatePolicy);
  router.get('/inbox', controller.listInbox);
  router.patch('/inbox/:id/read', express.json({ limit: '1kb' }), controller.markRead);
  router.get('/delivery', controller.listDelivery);
  return router;
}
// MUST mount before global express.json(). No session auth / arbitrary callback acceptance.
// Default verifier is disabled. Operator must independently provision public trust pins.
export function createNotificationFeedbackRouter({ verifier = createPinnedSnsVerifier(), applyFeedback = applyVerifiedNotificationFeedback } = {}) {
  const router = express.Router();
  router.post('/', rateLimit({ windowMs: 60000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false }), express.raw({ type: ['application/json', 'text/plain'], limit: '64kb' }), async (req, res) => {
    if (!verifier.enabled) return res.status(503).json({ error: 'Provider feedback integration is disabled.' });
    try {
      const event = verifier.verify(req.body);
      await applyFeedback(event);
      return res.status(200).json({ received: true });
    } catch (error) {
      return res.status(error.status || 503).json({ error: error.status ? error.message : 'Provider feedback could not be recorded.' });
    }
  });
  return router;
}
export default createNotificationRouter;
