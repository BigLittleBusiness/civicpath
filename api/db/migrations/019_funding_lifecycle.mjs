import { DataTypes } from 'sequelize';
import { sequelize } from '../../src/config/database.js';
import { applyFundingLifecycleSchema } from '../fundingLifecycleSchema.mjs';

try {
  await sequelize.authenticate();
  await applyFundingLifecycleSchema(sequelize.getQueryInterface(), DataTypes);
  console.info('CivicPath funding lifecycle migration 019 is complete (additive; no data cutover).');
} catch {
  // Do not echo connection details or SQL content in release logs.
  console.error('CivicPath funding lifecycle migration 019 failed. Inspect securely before retrying.');
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
