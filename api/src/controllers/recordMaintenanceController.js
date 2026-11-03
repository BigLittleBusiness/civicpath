import { sequelize } from '../config/database.js';
import * as models from '../models/index.js';
import { RecordMaintenanceState } from '../models/recordMaintenance.js';
import { recordAudit } from '../services/audit.js';
import { createMaintenanceService, MaintenanceError } from '../services/recordMaintenance.js';

const service = createMaintenanceService({ sequelize, models, Archive: RecordMaintenanceState, audit: recordAudit });
export function createRecordMaintenanceController(maintenanceService = service) {
  const respond = (operation, envelope = true) => async (req, res) => {
    try { const result = await operation(req); return res.json(envelope ? { data: result } : result); }
    catch (error) {
      if (error instanceof MaintenanceError) return res.status(error.status).json({ error: error.message, code: error.code });
      if (error.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ error: 'A matching record already exists. Refresh and review the current values.', code: 'maintenance_conflict' });
      if (error.name === 'SequelizeDatabaseError' || error.name?.startsWith('SequelizeConnection')) return res.status(503).json({ error: 'Record maintenance is unavailable. Ask your administrator to verify migration 015 and database availability.', code: 'maintenance_unavailable' });
      if (error.name === 'SequelizeValidationError') return res.status(422).json({ error: 'The record values could not be validated. Review the fields and retry.', code: 'maintenance_validation' });
      // Do not forward raw SQL, evidence URLs or record contents to the global console logger.
      return res.status(500).json({ error: 'The maintenance operation failed and was not committed. Retry or contact your administrator.', code: 'maintenance_failed' });
    }
  };
  // Existing endpoint aliases require the same explicit preconditions and changes envelope.
  const alias = (kind, param) => respond((req) => maintenanceService.mutate(req, kind, req.params[param], 'edit'));
  return {
    getMaintenanceRecord: respond((req) => maintenanceService.get(req, req.params.kind, req.params.recordId)),
    listMaintenanceRecords: respond((req) => maintenanceService.list(req, req.params.kind), false),
    listMaintenanceOptions: respond((req) => maintenanceService.options(req, req.params.reference), false),
    editMaintenanceRecord: respond((req) => maintenanceService.mutate(req, req.params.kind, req.params.recordId, 'edit')),
    archiveMaintenanceRecord: respond((req) => maintenanceService.mutate(req, req.params.kind, req.params.recordId, 'archive')),
    restoreMaintenanceRecord: respond((req) => maintenanceService.mutate(req, req.params.kind, req.params.recordId, 'restore')),
    updateMaintainedStrategyAction: alias('actions', 'actionId'),
    updateMaintainedMilestone: alias('milestones', 'milestoneId'),
    updateMaintainedProject: alias('projects', 'projectId'),
  };
}
export const {
  getMaintenanceRecord, listMaintenanceRecords, listMaintenanceOptions, editMaintenanceRecord,
  archiveMaintenanceRecord, restoreMaintenanceRecord, updateMaintainedStrategyAction,
  updateMaintainedMilestone, updateMaintainedProject,
} = createRecordMaintenanceController();
