import { pathToFileURL } from 'node:url';

// No schema sync, row deletion or data cutover. Explicit table/index creation is safe to rerun.
// This export can be tested without importing the application or database credentials.
export async function migrateRecordMaintenance(query, types) {
  const table = 'RecordMaintenanceState';
  const tables = await query.showAllTables();
  const exists = tables.some((item) => (typeof item === 'string' ? item : item.tableName || item.name) === table);
  if (!exists) await query.createTable(table, {
    id: { type: types.UUID, primaryKey: true, allowNull: false },
    organization_id: { type: types.UUID, allowNull: false },
    kind: { type: types.STRING(40), allowNull: false },
    record_id: { type: types.UUID, allowNull: false },
    version: { type: types.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    archived_at: { type: types.DATE, allowNull: true },
    archived_by: { type: types.UUID, allowNull: true },
    reason: { type: types.STRING(1000), allowNull: true },
    previous_is_active: { type: types.BOOLEAN, allowNull: true },
    restored_at: { type: types.DATE, allowNull: true },
    restored_by: { type: types.UUID, allowNull: true },
    created_at: { type: types.DATE, allowNull: false },
    updated_at: { type: types.DATE, allowNull: false },
  });
  const indexes = await query.showIndex(table);
  for (const [name, fields, unique] of [
    ['uq_rm_tenant_record', ['organization_id', 'kind', 'record_id'], true],
    ['idx_rm_tenant_archive', ['organization_id', 'kind', 'archived_at'], false],
  ]) if (!indexes.some((index) => index.name === name)) await query.addIndex(table, fields, { name, unique });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { sequelize } = await import('../../src/config/database.js');
  const { DataTypes } = await import('sequelize');
  try {
    await sequelize.authenticate();
    await migrateRecordMaintenance(sequelize.getQueryInterface(), DataTypes);
    console.info('CivicPath record maintenance metadata schema is ready.');
  } catch {
    // Keep connection details and driver errors out of migration output.
    console.error('Record maintenance migration failed. Check schema permissions and database availability.');
    process.exitCode = 1;
  } finally { await sequelize.close(); }
}
