import { DataTypes } from 'sequelize';
import { sequelize } from '../../src/config/database.js';

const enquiryTable = 'PublicContactEnquiry';

async function hasIndex(queryInterface, tableName, indexName) {
  const indexes = await queryInterface.showIndex(tableName);
  return indexes.some((index) => index.name === indexName);
}

try {
  await sequelize.authenticate();
  const queryInterface = sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable(enquiryTable);
  const additions = {
    confirmation_status: { type: DataTypes.ENUM('not_applicable', 'pending', 'sent', 'failed', 'disabled'), allowNull: false, defaultValue: 'not_applicable' },
    confirmation_attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    confirmation_last_attempt_at: { type: DataTypes.DATE, allowNull: true },
    confirmation_next_attempt_at: { type: DataTypes.DATE, allowNull: true },
    confirmation_delivered_at: { type: DataTypes.DATE, allowNull: true },
    confirmation_provider_reference: { type: DataTypes.STRING(255), allowNull: true },
    confirmation_error: { type: DataTypes.STRING(1000), allowNull: true },
  };
  for (const [column, definition] of Object.entries(additions)) {
    if (!columns[column]) await queryInterface.addColumn(enquiryTable, column, definition);
  }
  if (!await hasIndex(queryInterface, enquiryTable, 'pce_confirmation_retry')) {
    await queryInterface.addIndex(enquiryTable, ['confirmation_status', 'confirmation_next_attempt_at'], { name: 'pce_confirmation_retry' });
  }
  console.info('CivicPath Council Proof confirmation-delivery schema is ready.');
} catch (error) {
  console.error('CivicPath Council Proof confirmation migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
