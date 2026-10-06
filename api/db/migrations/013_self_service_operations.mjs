import { sequelize } from '../../src/config/database.js';
import { NotificationDelivery, Organization, SupportCase } from '../../src/models/index.js';

async function addMissingColumns(model, attributes) {
  const query = sequelize.getQueryInterface();
  const table = model.getTableName();
  const columns = await query.describeTable(table);
  const definitions = model.getAttributes();
  for (const attribute of attributes) {
    const definition = definitions[attribute];
    const column = definition.field || attribute;
    if (!columns[column]) await query.addColumn(table, column, definition);
  }
}

try {
  await sequelize.authenticate();
  // This migration is additive only: existing Council and developer data is never altered or dropped.
  await addMissingColumns(Organization, ['operatingContactName', 'operatingContactRole', 'operatingContactEmail', 'workspaceOwnerId', 'onboardingCompleteAt']);
  await addMissingColumns(SupportCase, ['firstResponseDueAt', 'firstRespondedAt', 'lastCustomerUpdateAt']);
  await NotificationDelivery.sync();
  console.info('CivicPath self-service profile, support triage and delivery-record schema is ready.');
} catch (error) {
  console.error('CivicPath self-service operations migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
