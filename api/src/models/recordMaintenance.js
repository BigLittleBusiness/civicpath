import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

// Standalone metadata only: original delivery rows and lifecycle statuses are preserved.
// A monotonically increasing maintenance version closes MySQL timestamp-resolution races.
export const RecordMaintenanceState = sequelize.models.RecordMaintenanceState || sequelize.define('RecordMaintenanceState', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  kind: { type: DataTypes.STRING(40), allowNull: false },
  recordId: { type: DataTypes.UUID, allowNull: false },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  archivedAt: { type: DataTypes.DATE, allowNull: true },
  archivedBy: { type: DataTypes.UUID, allowNull: true },
  reason: { type: DataTypes.STRING(1000), allowNull: true },
  previousIsActive: { type: DataTypes.BOOLEAN, allowNull: true },
  restoredAt: { type: DataTypes.DATE, allowNull: true },
  restoredBy: { type: DataTypes.UUID, allowNull: true },
}, {
  tableName: 'RecordMaintenanceState', timestamps: true, underscored: true, paranoid: false,
  indexes: [
    { name: 'uq_rm_tenant_record', unique: true, fields: ['organization_id', 'kind', 'record_id'] },
    { name: 'idx_rm_tenant_archive', fields: ['organization_id', 'kind', 'archived_at'] },
  ],
});
