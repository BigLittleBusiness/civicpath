import { sequelize } from '../../src/config/database.js';
import { PublicLead, PulseLeadConsent, PulseLeadNotification, PulseLeadResult, PulseLeadSession } from '../../src/models/index.js';

try {
  await sequelize.authenticate();
  await PublicLead.sync();
  await PulseLeadSession.sync();
  await PulseLeadConsent.sync();
  await PulseLeadResult.sync();
  await PulseLeadNotification.sync();
  console.info('CivicPath public Portfolio Readiness Pulse lead schema is ready.');
} catch (error) {
  console.error('CivicPath public Pulse lead migration failed:', error);
  process.exitCode = 1;
} finally {
  await sequelize.close();
}
