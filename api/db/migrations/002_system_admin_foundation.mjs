import { sequelize } from '../../src/config/database.js';
import { PlatformSetting, SupportCase } from '../../src/models/index.js';

try {
  await sequelize.authenticate();
  await sequelize.query("ALTER TABLE `Organization` MODIFY COLUMN `organisation_type` ENUM('council','joint_organisation','partner','demo','platform') NOT NULL DEFAULT 'council'");
  await PlatformSetting.sync();
  await SupportCase.sync();
  console.info('CivicPath System Admin schema is ready.');
} catch (error) {
  console.error('CivicPath System Admin migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}

