import { sequelize } from '../../src/config/database.js';
import { CouncilInvitation } from '../../src/models/index.js';

try {
  await sequelize.authenticate();
  await CouncilInvitation.sync();
  console.info('CivicPath council People & Access invitation schema is ready.');
} catch (error) {
  console.error('CivicPath council People & Access migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
