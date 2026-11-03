import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

// No model.sync, associations or registration side effects in central models.
export function lifecycleDefinitions(types = DataTypes) {
  const id = () => ({ type: types.UUID, primaryKey: true, defaultValue: types.UUIDV4 });
  const org = () => ({ type: types.UUID, allowNull: false, references: { model: 'Organization', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
  const actor = (required = false) => ({ type: types.UUID, allowNull: !required, references: { model: 'User', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' });
  return {
    TenantLifecycleState: {
      attributes: { id: id(), organizationId: { ...org(), unique: true }, holdActive: { type: types.BOOLEAN, allowNull: false, defaultValue: false }, closedAt: { type: types.DATE, allowNull: true } },
      indexes: [{ name: 'tls_org_unique', unique: true, fields: ['organization_id'] }],
    },
    TenantLifecycleRequest: {
      attributes: { id: id(), organizationId: org(), kind: { type: types.STRING(40), allowNull: false }, reason: { type: types.TEXT, allowNull: false },
        status: { type: types.STRING(40), allowNull: false, defaultValue: 'pending' }, requestedBy: actor(true), reviewedBy: actor(), reviewNote: { type: types.TEXT, allowNull: true },
        approvalReference: { type: types.STRING(240), allowNull: true }, humanVerified: { type: types.BOOLEAN, allowNull: false, defaultValue: false },
        backupTreatmentVerified: { type: types.BOOLEAN, allowNull: false, defaultValue: false }, objectVersionsVerified: { type: types.BOOLEAN, allowNull: false, defaultValue: false },
        reviewedAt: { type: types.DATE, allowNull: true } },
      indexes: [{ name: 'tlr_org_status_created', fields: ['organization_id', 'status', 'created_at'] }],
    },
    TenantWorkspaceExport: {
      attributes: { id: id(), organizationId: org(), requestedBy: actor(true), status: { type: types.STRING(40), allowNull: false, defaultValue: 'building' },
        encryptedPayload: { type: types.TEXT('long'), allowNull: true }, checksumSha256: { type: types.STRING(64), allowNull: true },
        byteCount: { type: types.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }, rowCount: { type: types.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
        expiresAt: { type: types.DATE, allowNull: false }, leaseUntil: { type: types.DATE, allowNull: false }, errorCode: { type: types.STRING(80), allowNull: true },
        downloadCount: { type: types.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 }, lastDownloadedAt: { type: types.DATE, allowNull: true } },
      indexes: [{ name: 'twe_org_status_created', fields: ['organization_id', 'status', 'created_at'] }, { name: 'twe_status_expiry', fields: ['status', 'expires_at'] }],
    },
    TenantAttachmentRequest: {
      attributes: { id: id(), organizationId: org(), kind: { type: types.STRING(40), allowNull: false }, attachmentId: { type: types.UUID, allowNull: false },
        requestedBy: actor(true), status: { type: types.STRING(40), allowNull: false, defaultValue: 'pending_private_delivery' } },
      indexes: [{ name: 'tar_org_created', fields: ['organization_id', 'created_at'] }, { name: 'tar_org_attachment_status', fields: ['organization_id', 'attachment_id', 'status'] }],
    },
  };
}
export const lifecycleModels = Object.fromEntries(Object.entries(lifecycleDefinitions()).map(([name, definition]) => [name,
  sequelize.models[name] || sequelize.define(name, definition.attributes, { timestamps: true, underscored: true, paranoid: false, freezeTableName: true, indexes: definition.indexes })]));
export const { TenantLifecycleState, TenantLifecycleRequest, TenantWorkspaceExport, TenantAttachmentRequest } = lifecycleModels;
