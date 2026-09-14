import cron from 'node-cron';
import { env } from './config/env.js';

export function registerScheduledJobs() {
  if (env.nodeEnv === 'test') return;
  cron.schedule('0 7 * * 1-5', () => {
    // The notification service will evaluate due work, grant deadlines and acquittals.
    // Delivery remains disabled until SES configuration and notification preferences are complete.
    console.info('[civicpath] scheduled due-date review started');
  }, { timezone: 'Australia/Sydney' });
}

