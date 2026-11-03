import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

// Additive sidecar: no central model mutation, sync or associations required.
export const FundingLifecycleRecord = sequelize.define('FundingLifecycleRecord', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  entityType: { type: DataTypes.STRING(16), allowNull: false, validate: { isIn: [['grant', 'pathway']] } },
  entityId: { type: DataTypes.UUID, allowNull: false },
  version: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
  archivedAt: { type: DataTypes.DATE, allowNull: true },
  provenance: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'legacy_unverified', validate: { isIn: [['council_entered', 'legacy_unverified']] } },
  sourceUrl: { type: DataTypes.STRING(1000), allowNull: true },
  evidenceIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  workItemIds: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  createdBy: { type: DataTypes.UUID, allowNull: true },
  updatedBy: { type: DataTypes.UUID, allowNull: true },
}, {
  tableName: 'funding_lifecycle_records', underscored: true, timestamps: true, paranoid: false,
  indexes: [
    { name: 'funding_lifecycle_entity_unique', unique: true, fields: ['organization_id', 'entity_type', 'entity_id'] },
    { name: 'funding_lifecycle_archive', fields: ['organization_id', 'entity_type', 'archived_at'] },
  ],
});
