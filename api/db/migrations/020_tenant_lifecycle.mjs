import { pathToFileURL } from 'node:url';

// Dependency injection keeps migration rerun tests DB-free. Imports/config occur only on direct invocation.
export async function applyTenantLifecycleMigration({ queryInterface, definitions, dataTypes }) {
  const timestamp = () => ({ type: dataTypes.DATE, allowNull: false });
  const snake = (name) => name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  const tables = new Set((await queryInterface.showAllTables()).map((table) => typeof table === 'string' ? table : table.tableName || table.name));
  for (const [name, definition] of Object.entries(definitions)) {
    const columns = Object.fromEntries(Object.entries(definition.attributes).map(([attribute, value]) => [snake(attribute), { ...value }]));
    columns.created_at = timestamp(); columns.updated_at = timestamp();
    if (!tables.has(name)) await queryInterface.createTable(name, columns);
    else {
      const existing = await queryInterface.describeTable(name);
      for (const [column, value] of Object.entries(columns)) if (!existing[column]) await queryInterface.addColumn(name, column, value);
    }
    const indexes = new Set((await queryInterface.showIndex(name)).map((index) => index.name));
    for (const index of definition.indexes) if (!indexes.has(index.name)) await queryInterface.addIndex(name, index.fields, { name: index.name, unique: !!index.unique });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let sequelize;
  try {
    ({ sequelize } = await import('../../src/config/database.js'));
    const { DataTypes } = await import('sequelize');
    const { lifecycleDefinitions } = await import('../../src/models/tenantLifecycleModels.js');
    await sequelize.authenticate();
    await applyTenantLifecycleMigration({ queryInterface: sequelize.getQueryInterface(), definitions: lifecycleDefinitions(), dataTypes: DataTypes });
    console.info('CivicPath tenant lifecycle additive schema ready; retention and erasure remain disabled.');
  } catch {
    console.error('Tenant lifecycle migration failed. Review restricted server diagnostics before retrying.');
    process.exitCode = 1;
  } finally { if (sequelize) await sequelize.close(); }
}
