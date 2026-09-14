import { DataTypes } from 'sequelize';
import { sequelize } from '../../src/config/database.js';
import { User, CustomerContact, CustomerNote, TenantStateEvent } from '../../src/models/index.js';

async function ensureColumn(table, column, definition) {
  const schema = await sequelize.getQueryInterface().describeTable(table);
  if (!schema[column]) await sequelize.getQueryInterface().addColumn(table, column, definition);
}

try {
  await sequelize.authenticate();
  const table = User.getTableName();
  await ensureColumn(table, 'mfa_required', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  await ensureColumn(table, 'mfa_enabled', { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false });
  await ensureColumn(table, 'mfa_secret_encrypted', { type: DataTypes.JSON, allowNull: true });
  await ensureColumn(table, 'mfa_recovery_codes', { type: DataTypes.JSON, allowNull: true });
  await ensureColumn(table, 'mfa_enrolled_at', { type: DataTypes.DATE, allowNull: true });
  await ensureColumn(table, 'mfa_last_verified_at', { type: DataTypes.DATE, allowNull: true });
  await CustomerContact.sync();
  await CustomerNote.sync();
  await TenantStateEvent.sync();
  console.info('CivicPath Customer 360° and MFA schema is ready.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally { await sequelize.close(); }
