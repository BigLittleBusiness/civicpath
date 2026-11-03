import { Router } from 'express';
import { requireAuth, tenantScope, requireActiveEntitlement } from '../../middleware/auth.js';
import {
  getMaintenanceRecord, listMaintenanceRecords, listMaintenanceOptions, editMaintenanceRecord,
  archiveMaintenanceRecord, restoreMaintenanceRecord, updateMaintainedStrategyAction,
  updateMaintainedMilestone, updateMaintainedProject,
} from '../../controllers/recordMaintenanceController.js';

function protectedRouter() {
  const router = Router();
  router.use(requireAuth, tenantScope, requireActiveEntitlement);
  return router;
}
// Mount at /maintenance. Each handler also rechecks the active database user,
// tenant, session version and current role; never trust a stale role in a JWT.
export const recordMaintenanceRouter = protectedRouter();
recordMaintenanceRouter.get('/options/:reference', listMaintenanceOptions);
recordMaintenanceRouter.get('/:kind/:recordId', getMaintenanceRecord);
recordMaintenanceRouter.get('/:kind', listMaintenanceRecords);
recordMaintenanceRouter.patch('/:kind/:recordId', editMaintenanceRecord);
recordMaintenanceRouter.post('/:kind/:recordId/archive', archiveMaintenanceRecord);
recordMaintenanceRouter.post('/:kind/:recordId/restore', restoreMaintenanceRecord);

// Mount at / BEFORE legacy PATCH handlers: retains the established action/milestone
// URLs while enforcing the new transactional, role and conflict-safe contract.
export const recordMaintenanceCompatibilityRouter = protectedRouter();
recordMaintenanceCompatibilityRouter.patch('/strategy-actions/:actionId', updateMaintainedStrategyAction);
recordMaintenanceCompatibilityRouter.patch('/strategy-milestones/:milestoneId', updateMaintainedMilestone);
// Optional project alias is separate because the existing selector create form is unchanged.
export const recordMaintenanceProjectCompatibilityRouter = protectedRouter();
recordMaintenanceProjectCompatibilityRouter.patch('/projects/:projectId', updateMaintainedProject);
