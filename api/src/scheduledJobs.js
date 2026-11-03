import cron from 'node-cron';
import { env } from './config/env.js';
import { jobHeartbeats, runSafeNotificationCycle } from './backendRuntime.js';
let registration;
// Only the policy/entitlement-scoped reliable notification worker is commissioned.
// Legacy public transports lack this opt-in contract; strategyAlerts is unbounded.
// Neither is registered as healthy work. No log-only placeholder remains.
export async function registerScheduledJobs({ schedule = cron.schedule, registry = jobHeartbeats, cycle = runSafeNotificationCycle, nodeEnv = env.nodeEnv } = {}) {
  if (nodeEnv === 'test') return { enabled: false };
  if (registration) return registration;
  registry.register('reliable_notifications', { maxAgeMs: 25 * 60_000, maxRunMs: 15 * 60_000 });
  let running = false;
  const run = async () => {
    if (running) return { skippedOverlap: true };
    running = true;
    try { return await registry.run('reliable_notifications', cycle); }
    finally { running = false; }
  };
  const task = schedule('*/15 * * * *', () => run().catch(() => console.error('[civicpath] reliable notification cycle failed')), { timezone: 'Australia/Sydney' });
  registration = { enabled: true, task, run };
  // Genuine finite current-policy sweep; failure leaves readiness unready.
  await run().catch(() => console.error('[civicpath] startup notification catch-up failed'));
  return registration;
}
