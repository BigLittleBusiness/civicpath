import { pathToFileURL } from 'node:url';

// Exported for deterministic rerun tests without starting or connecting a database.
export async function migrateNotificationReliability({ queryInterface, models }) {
  const tables = (await queryInterface.showAllTables()).map((table) => typeof table === 'string' ? table : table.tableName || table.table_name);
  for (const model of models) {
    const table = model.getTableName();
    const columns = Object.fromEntries(Object.values(model.getAttributes()).map((definition) => [definition.field || definition.fieldName, { ...definition }]));
    if (!tables.includes(table)) { await queryInterface.createTable(table, columns); tables.push(table); }
    const existingColumns = await queryInterface.describeTable(table);
    for (const [column, definition] of Object.entries(columns)) {
      // Enables safe completion after interrupted DDL without modifying existing data/columns.
      if (!existingColumns[column]) await queryInterface.addColumn(table, column, definition);
    }
    const existingIndexes = await queryInterface.showIndex(table);
    for (const index of model.options.indexes || []) if (!existingIndexes.some((existing) => existing.name === index.name)) await queryInterface.addIndex(table, index.fields, { name: index.name, unique: Boolean(index.unique) });
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { sequelize } = await import('../../src/config/database.js');
  try {
    const { notificationModels } = await import('../../src/models/notificationReliability.js');
    await sequelize.authenticate();
    await migrateNotificationReliability({ queryInterface: sequelize.getQueryInterface(), models: notificationModels });
    console.info('CivicPath notification reliability migration 017 complete. Email defaults remain disabled.');
  } catch {
    console.error('CivicPath notification reliability migration 017 failed; inspect schema safely before retrying.');
    process.exitCode = 1;
  } finally { await sequelize.close(); }
}
