import { AuditLog } from '../models/index.js';

export function recordAudit(req, { entityType, entityId, action, metadata = {} }) {
  return AuditLog.create({
    organizationId: req.tenant.organizationId,
    userId: req.auth?.sub || null,
    entityType,
    entityId,
    action,
    metadata,
    ipAddress: req.ip,
  }).catch((error) => console.error('Audit log write failed', error));
}

