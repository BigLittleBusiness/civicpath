import { Router } from 'express';
import { createReportSnapshotController } from '../../controllers/reportSnapshotController.js';
import { reportRepository, reportTransaction, authorizeReportActor } from '../../services/reportRepository.js';
import { recordAudit } from '../../services/audit.js';

// Mount AFTER requireAuth, tenantScope and requireActiveEntitlement in v1/index.js.
// The controller independently re-checks persisted actor role and tenant membership.
export function createReportSnapshotsRouter(dependencies = { repository: reportRepository, transaction: reportTransaction, audit: recordAudit, authorizeActor: authorizeReportActor }) {
  const router = Router(); const c = createReportSnapshotController(dependencies);
  router.get('/reports/strategies', c.listStrategies);
  router.get('/reports/strategies/:strategyId/periods', c.listPeriods);
  router.get('/reports/periods/:periodId', c.getLiveReport);
  router.get('/reports/periods/:periodId/snapshots', c.listSnapshots);
  router.post('/reports/periods/:periodId/snapshots', c.createSnapshot);
  router.get('/reports/snapshots/:snapshotId', c.getSnapshot);
  router.get('/reports/snapshots/:snapshotId/download', c.downloadSnapshot);
  // Compatibility: parent must REMOVE the original shared writer and mount this router first.
  router.get('/strategy-reporting-periods/:periodId/report', c.getLiveReport);
  router.post('/strategy-reporting-periods/:periodId/report-snapshots', c.createSnapshot);
  // There are intentionally no update, approval, overwrite or delete routes.
  return router;
}
export const reportSnapshotsRouter = createReportSnapshotsRouter();
