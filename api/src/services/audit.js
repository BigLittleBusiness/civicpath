import { AuditLog } from '../models/index.js';

// Callers performing multi-record business operations must pass the active
// transaction so that the audit trail commits or rolls back with the change.
export function recordAudit(req, { entityType, entityId, action, metadata = {}, transaction } = {}) {
  return AuditLog.create({
    organizationId: req.tenant.organizationId,
    userId: req.auth?.sub || null,
    entityType,
    entityId,
    action,
    metadata,
    ipAddress: req.ip,
  }, transaction ? { transaction } : undefined);
}
