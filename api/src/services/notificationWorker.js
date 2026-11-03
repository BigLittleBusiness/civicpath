import { MAX_BATCH, retryDecision, genericNotification, notificationError } from './notificationPolicy.js';

// Store contract is deliberately injected so the worker can be tested without a DB or provider.
export async function processNotificationBatch({ store, sender, now = () => new Date(), limit = MAX_BATCH, random = Math.random }) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_BATCH) throw notificationError('Batch size must be between 1 and 25.');
  const rows = await store.claim({ limit, now: now() });
  const result = { claimed: rows.length, accepted: 0, inApp: 0, suppressed: 0, retried: 0, failed: 0, uncertain: 0, lostLease: 0, errors: 0 };
  for (const row of rows) {
    let started = false;
    try {
      if (new Date(row.expiresAt) <= now()) {
        await store.finish(row, { status: 'suppressed', errorCode: 'expired' }); result.suppressed += 1; continue;
      }
      const context = await store.context(row, now());
      if (context.suppression) { await store.finish(row, { status: 'suppressed', errorCode: context.suppression }); result.suppressed += 1; continue; }
      if (context.deferUntil) { await store.finish(row, { status: 'pending', availableAt: context.deferUntil, errorCode: null }); continue; }
      if (row.channel === 'in_app') { if (await store.finish(row, { status: 'in_app', errorCode: null })) result.inApp += 1; else result.lostLease += 1; continue; }
      if (row.channel !== 'email') { await store.finish(row, { status: 'failed', errorCode: 'invalid_channel' }); result.failed += 1; continue; }
      // Durable write precedes SES. Once sending begins, an expired lease is terminal uncertain,
      // never reclaimable for automatic sending. SES SendEmail has no idempotency token.
      if (!await store.beginSend(row, context, now())) { result.lostLease += 1; continue; }
      started = true;
      const fresh = await store.context(row, now());
      if (fresh.suppression || fresh.deferUntil || fresh.email !== context.email) {
        await store.finish(row, { status: 'suppressed', errorCode: fresh.suppression || (fresh.email !== context.email ? 'recipient_changed' : 'quiet_hours_changed') }); result.suppressed += 1; continue;
      }
      try {
        const response = await sender({ to: fresh.email, config: fresh.config, message: genericNotification(row.kind), outboxId: row.id });
        if (!response?.providerReference || typeof response.providerReference !== 'string' || response.providerReference.length > 255) throw notificationError('Provider acceptance could not be confirmed.');
        if (await store.finish(row, { status: 'accepted', providerReference: response.providerReference, errorCode: null })) result.accepted += 1;
        else result.lostLease += 1;
      } catch (error) {
        const decision = retryDecision(error, row.attemptCount, now(), random);
        await store.finish(row, decision);
        result[decision.status === 'pending' ? 'retried' : decision.status] += 1;
      }
    } catch {
      // Do not emit raw errors: SDK/DB errors may include recipients or sensitive content.
      result.errors += 1;
      try { await store.finish(row, { status: started ? 'uncertain' : 'pending', availableAt: new Date(now().getTime() + 60000), errorCode: started ? 'acceptance_unknown' : 'context_unavailable' }); } catch { /* Durable lease recovery is the fallback. */ }
    }
  }
  return result;
}
