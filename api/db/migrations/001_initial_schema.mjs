import { sequelize } from '../../src/config/database.js';
import '../../src/models/index.js';

try {
  await sequelize.authenticate();
  await sequelize.sync();
  console.info('CivicPath initial schema is ready.');
} catch (error) {
  console.error('CivicPath migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}

