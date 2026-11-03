import { Op, Transaction } from 'sequelize';
import { sequelize } from '../config/database.js';
import { models } from '../models/index.js';
import { lifecycleModels } from '../models/tenantLifecycleModels.js';
import { closeTenantWorkspaceAccess } from './tenantLifecycleAccess.js';
import { LifecycleError } from './tenantLifecyclePolicy.mjs';

const all = { ...models, ...lifecycleModels };
const { Organization, User, AuditLog, SupportAttachment, SupportCase, EvidenceItem, TenantLifecycleState: State, TenantLifecycleRequest: Request, TenantWorkspaceExport: Export, TenantAttachmentRequest: AttachmentRequest } = all;
const lock = (transaction) => transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {};
export function exportSummary(record, now = Date.now()) {
  return { id: record.id, status: record.status === 'ready' && new Date(record.expiresAt).getTime() <= now ? 'expired' : record.status,
    createdAt: record.createdAt, expiresAt: record.expiresAt, checksumSha256: record.checksumSha256, rowCount: record.rowCount,
    byteCount: record.byteCount, errorCode: record.errorCode, downloadCount: record.downloadCount };
}
export const tenantLifecycleRepository = {
  transaction: (work) => sequelize.transaction(work),
  snapshot: (work) => sequelize.transaction({ isolationLevel: Transaction.ISOLATION_LEVELS.REPEATABLE_READ, readOnly: true }, work),
  user: (id, transaction) => id ? User.findOne({ where: { id }, attributes: ['id', 'organizationId', 'role', 'status', 'sessionVersion'], transaction }) : null,
  organization: (id, transaction) => Organization.findOne({ where: { id }, attributes: ['id', 'name', 'status', 'organisationType'], ...lock(transaction) }),
  state: async (organizationId, transaction) => {
    const state = await State.findOne({ where: { organizationId }, ...lock(transaction) });
    return state || State.create({ organizationId, holdActive: false }, { transaction });
  },
  closeAccess: (organization, state, now, transaction) => closeTenantWorkspaceAccess({ organization, state, now, transaction }),
  setHold: (state, holdActive, transaction) => state.update({ holdActive }, { transaction }),
  audit: ({ transaction, ...event }) => AuditLog.create({ ...event, entityType: 'tenant_lifecycle' }, { transaction }),
  readPage: async ({ name, definition, organizationId, cursor, limit, transaction }) => {
    const model = all[name]; if (!model) throw new LifecycleError('export_model_unavailable', 503);
    const attributes = model.getAttributes();
    // Explicitly validate every requested field; timestamps absent on append-only records are omitted.
    if (definition.fields.some((field) => !['createdAt', 'updatedAt'].includes(field) && !Object.hasOwn(attributes, field))) throw new LifecycleError('export_schema_unavailable', 503);
    const fields = definition.fields.filter((field) => Object.hasOwn(attributes, field));
    const where = { ...definition.where, ...(name === 'Organization' ? { id: organizationId } : { organizationId }) };
    if (definition.sharedCatalog) { delete where.organizationId; where[Op.or] = [{ organizationId }, { organizationId: null }]; }
    if (cursor && name === 'Organization') return [];
    if (cursor) where.id = { [Op.gt]: cursor };
    const rows = await model.findAll({ where, attributes: fields, order: [['id', 'ASC']], limit, raw: true, transaction });
    return rows.map((row) => { for (const field of definition.jsonFields || []) if (typeof row[field] === 'string') { try { row[field] = JSON.parse(row[field]); } catch { throw new LifecycleError('export_invalid_json', 409); } } return row; });
  },
  listRequests: (organizationId, transaction, limit) => Request.findAll({ where: { organizationId }, order: [['createdAt', 'DESC'], ['id', 'DESC']], limit, transaction }),
  listExports: async (organizationId, transaction, limit) => (await Export.findAll({ where: { organizationId }, attributes: ['id', 'status', 'createdAt', 'expiresAt', 'checksumSha256', 'rowCount', 'byteCount', 'errorCode', 'downloadCount'], order: [['createdAt', 'DESC']], limit, transaction })).map((row) => exportSummary(row)),
  listAttachmentRequests: (organizationId, transaction, limit) => AttachmentRequest.findAll({ where: { organizationId }, order: [['createdAt', 'DESC']], limit, transaction }),
  pendingRequest: (organizationId, kind, transaction) => Request.findOne({ where: { organizationId, kind, status: { [Op.in]: ['pending', 'reviewed', 'approved_pending_policy'] } }, transaction }),
  hasPendingHold: (organizationId, transaction) => Request.findOne({ where: { organizationId, kind: 'legal_hold', status: { [Op.in]: ['pending', 'reviewed'] } }, transaction }),
  requestCount: (organizationId, since, transaction) => Request.count({ where: { organizationId, createdAt: { [Op.gte]: since } }, transaction }),
  getRequest: (organizationId, id, transaction) => Request.findOne({ where: { organizationId, id }, ...lock(transaction) }),
  createRequest: (values, transaction) => Request.create(values, { transaction }),
  updateRequest: (record, values, transaction) => record.update(values, { transaction }),
  createExport: (values, transaction) => Export.create(values, { transaction }),
  getExport: (organizationId, id, transaction) => Export.findOne({ where: { organizationId, id }, ...lock(transaction) }),
  updateExport: (record, values, transaction) => record.update(values, { transaction }),
  exportSummary,
  activeExport: (organizationId, now, transaction) => Export.findOne({ where: { organizationId, status: 'building', leaseUntil: { [Op.gt]: new Date(now) } }, transaction }),
  exportCount: (organizationId, since, transaction) => Export.count({ where: { organizationId, createdAt: { [Op.gte]: since } }, transaction }),
  readyExportCount: (organizationId, now, transaction) => Export.count({ where: { organizationId, status: 'ready', expiresAt: { [Op.gt]: new Date(now) } }, transaction }),
  expireArtifacts: async (organizationId, now, transaction) => {
    // Only derived encrypted export payloads expire. Never deletes workspace, audit, backup or attachment data.
    await Export.update({ status: 'expired', encryptedPayload: null }, { where: { organizationId, status: 'ready', expiresAt: { [Op.lte]: new Date(now) } }, transaction });
    await Export.update({ status: 'failed', errorCode: 'export_lease_expired', encryptedPayload: null }, { where: { organizationId, status: 'building', leaseUntil: { [Op.lte]: new Date(now) } }, transaction });
  },
  attachmentOwned: async (organizationId, kind, id, transaction) => {
    if (kind === 'evidence') return !!await EvidenceItem.findOne({ where: { id, organizationId, evidenceType: 'document' }, attributes: ['id'], transaction });
    const attachment = await SupportAttachment.findOne({ where: { id, organizationId }, attributes: ['id', 'supportCaseId'], transaction });
    return !!attachment && !!await SupportCase.findOne({ where: { id: attachment.supportCaseId, organizationId }, attributes: ['id'], transaction });
  },
  pendingAttachment: (organizationId, kind, attachmentId, transaction) => AttachmentRequest.findOne({ where: { organizationId, kind, attachmentId, status: 'pending_private_delivery' }, transaction }),
  attachmentRequestCount: (organizationId, since, transaction) => AttachmentRequest.count({ where: { organizationId, createdAt: { [Op.gte]: since } }, transaction }),
  createAttachmentRequest: (values, transaction) => AttachmentRequest.create(values, { transaction }),
};
