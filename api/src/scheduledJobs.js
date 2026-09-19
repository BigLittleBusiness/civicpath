import cron from 'node-cron';
import { env } from './config/env.js';
import { retryPendingPulseNotifications } from './services/pulseNotifications.js';

export function registerScheduledJobs() {
  if (env.nodeEnv === 'test') return;
  cron.schedule('0 7 * * 1-5', () => {
    // The notification service will evaluate due work, grant deadlines and acquittals.
    // Delivery remains disabled until SES configuration and notification preferences are complete.
    console.info('[civicpath] scheduled due-date review started');
  }, { timezone: 'Australia/Sydney' });
  cron.schedule('*/15 * * * *', () => retryPendingPulseNotifications()
    .then(({ attempted }) => attempted && console.info(`[civicpath] retried ${attempted} pending Pulse notifications`))
    .catch((error) => console.error('[civicpath] Pulse notification retry failed', error)), { timezone: 'Australia/Sydney' });
}
