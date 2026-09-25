import { DataTypes } from 'sequelize';
import { sequelize } from '../../src/config/database.js';
import { SupportAttachment } from '../../src/models/index.js';

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
    follow_up_status: { type: DataTypes.ENUM('new', 'contacted', 'follow_up_due', 'nurture', 'closed', 'not_a_fit'), allowNull: false, defaultValue: 'new' },
    follow_up_due_at: { type: DataTypes.DATE, allowNull: true },
    follow_up_note: { type: DataTypes.TEXT, allowNull: true },
    follow_up_owner_id: { type: DataTypes.UUID, allowNull: true, references: { model: 'User', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
    follow_up_updated_at: { type: DataTypes.DATE, allowNull: true },
    follow_up_resolved_at: { type: DataTypes.DATE, allowNull: true },
  };
  for (const [column, definition] of Object.entries(additions)) {
    if (!columns[column]) await queryInterface.addColumn(enquiryTable, column, definition);
  }
  if (!await hasIndex(queryInterface, enquiryTable, 'pce_follow_up_queue')) {
    await queryInterface.addIndex(enquiryTable, ['follow_up_status', 'follow_up_due_at', 'created_at'], { name: 'pce_follow_up_queue' });
  }
  await SupportAttachment.sync();
  console.info('CivicPath enquiry follow-up and private support attachment schema is ready.');
} catch (error) {
  console.error('CivicPath enquiry follow-up and support attachment migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
