import { recipientHash, retryDecision } from './notificationPolicy.js';

export const TRANSACTIONAL_CATEGORIES = Object.freeze(['registration_checkout', 'password_reset', 'workspace_invitation', 'workspace_invitation_resend', 'account_activated', 'refund_requested', 'transactional']);
export async function sendSingleUseTransactionalEmail({ to, message, organizationId = null, userId = null, category = 'transactional' }, { guard, configuration, receipts, send, report = async () => {} }) {
  if (!TRANSACTIONAL_CATEGORIES.includes(category) || typeof to !== 'string' || !message || typeof message.subject !== 'string') return { status: 'failed', errorCode: 'invalid_request' };
  let config; let blocked;
  try { blocked = await guard({ to, organizationId, userId, category }); config = blocked ? null : await configuration(); } catch { return { status: 'failed', errorCode: 'context_unavailable' }; }
  const disabled = blocked || !config?.emailEnabled || !config.awsCredentialsConfigured || !config.fromEmail;
  let receipt;
  try { receipt = await receipts.start({ organizationId, userId, category, recipientHash: recipientHash(to), status: disabled ? 'disabled' : 'sending', errorCode: blocked || (disabled ? 'provider_disabled' : null) }); }
  catch { return { status: 'failed', errorCode: 'receipt_unavailable' }; }
  let outcome = { status: 'disabled', errorCode: blocked || 'provider_disabled' };
  if (!disabled) {
    try {
      const freshBlocked = await guard({ to, organizationId, userId, category });
      if (freshBlocked) outcome = { status: 'disabled', errorCode: freshBlocked };
      else {
        const response = await send({ to, message, config });
        if (!response?.providerReference || typeof response.providerReference !== 'string' || response.providerReference.length > 255) throw new Error('No acceptance receipt');
        outcome = { status: 'accepted', providerReference: response.providerReference };
      }
    } catch (error) {
      const result = retryDecision(error, 5, new Date());
      outcome = { status: result.status, errorCode: result.errorCode };
    }
    try { await receipts.finish(receipt, outcome); } catch { return { status: 'uncertain', errorCode: 'receipt_update_failed' }; }
  }
  // Report only approved generic subject/category metadata; no replay surface.
  try { await report({ organizationId, userId, category, recipientHash: recipientHash(to), outcome }); } catch { /* Primary durable receipt remains authoritative. */ }
  return outcome;
}
