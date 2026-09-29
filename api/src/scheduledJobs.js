import cron from 'node-cron';
import { env } from './config/env.js';
import { retryPendingPulseNotifications } from './services/pulseNotifications.js';
import { retryPendingContactNotifications } from './services/contactNotifications.js';
import { evaluateStrategyAlerts } from './services/strategyAlerts.js';

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
  cron.schedule('*/15 * * * *', () => retryPendingContactNotifications()
    .then(({ attempted }) => attempted && console.info(`[civicpath] retried ${attempted} pending contact notifications`))
    .catch((error) => console.error('[civicpath] contact notification retry failed', error)), { timezone: 'Australia/Sydney' });
  // Creates in-app accountability alerts only; external delivery remains opt-in until notification preferences are configured.
  cron.schedule('10 6 * * 1-5', () => evaluateStrategyAlerts()
    .then(({ created, resolved }) => (created || resolved) && console.info(`[civicpath] strategy alerts refreshed: ${created} created, ${resolved} resolved`))
    .catch((error) => console.error('[civicpath] strategy alert refresh failed', error)), { timezone: 'Australia/Sydney' });
}
