import { sequelize } from '../../src/config/database.js';
import { PublicContactEnquiry, PublicFormChallenge } from '../../src/models/index.js';

try {
  await sequelize.authenticate();
  await PublicFormChallenge.sync();
  await PublicContactEnquiry.sync();
  console.info('CivicPath public contact and ALTCHA protection schema is ready.');
} catch (error) {
  console.error('CivicPath public contact migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
