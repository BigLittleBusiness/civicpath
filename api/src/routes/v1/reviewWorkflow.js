import { Router } from 'express';
import { requireRoles } from '../../middleware/auth.js';
import { updateReviewPackStatus, answerReviewPackQuestion } from '../../controllers/collaborationController.js';

// Mount at '/' AFTER requireAuth, tenantScope and requireActiveEntitlement.
// Existing collaboration routes remain in the parent-owned central route file.
export const reviewWorkflowRouter = Router();
reviewWorkflowRouter.patch('/review-packs/:reviewPackId/status', requireRoles('org_admin', 'portfolio_manager', 'contributor'), updateReviewPackStatus);
reviewWorkflowRouter.patch('/review-packs/:reviewPackId/questions/:questionId', requireRoles('org_admin', 'portfolio_manager', 'contributor'), answerReviewPackQuestion);
export default reviewWorkflowRouter;
