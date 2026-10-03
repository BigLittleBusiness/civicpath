import assert from 'node:assert/strict';
import test from 'node:test';
import { accountActivatedMessage, councilInvitationMessage, passwordResetMessage, refundRequestedMessage, registrationReceiptMessage } from '../src/services/accountNotifications.js';
import { BillingConfigurationError, checkoutTaxParameters, invoicePaymentIntentId, priceIdForPlan, subscriptionPeriodEnd } from '../src/services/stripeBilling.js';

function assertQuartermarkEmail(message) {
  assert.match(message.html, /alt="CivicPath"/);
  assert.match(message.html, /https?:\/\/[^"']+\/civicpath-quartermark\.png/);
  assert.match(message.html, /#040404/);
  assert.match(message.html, /#163133/);
  assert.match(message.html, /#0D6A55/);
  assert.match(message.html, /#CD7C4E/);
}

test('registration and activation messages set clear CivicPath account expectations', () => {
  const receipt = registrationReceiptMessage({ firstName: 'Taylor', organisationName: 'Example Council', planName: 'CivicPath Core', checkoutUrl: 'https://checkout.stripe.test/example' });
  const activation = accountActivatedMessage({ firstName: 'Taylor', organisationName: 'Example Council', planName: 'CivicPath Core', signInUrl: 'https://app.civicpath.com.au/login' });
  assert.equal(receipt.subject, 'CivicPath - Complete your secure subscription checkout');
  assert.match(receipt.text, /secure Stripe checkout/);
  assert.match(receipt.text, /activated only after Stripe confirms payment/);
  assertQuartermarkEmail(receipt);
  assert.equal(activation.subject, 'CivicPath - Your Council workspace is active');
  assert.match(activation.text, /Stripe has confirmed payment/);
  assertQuartermarkEmail(activation);
});

test('password reset and refund messages use the shared Quartermark email shell', () => {
  const reset = passwordResetMessage({ firstName: 'Taylor', resetUrl: 'https://app.civicpath.com.au/reset-password?token=abc' });
  const refund = refundRequestedMessage({ firstName: 'Taylor', amountLabel: '$495.00', organisationName: 'Example Council' });
  assert.equal(reset.subject, 'CivicPath - Reset your password');
  assert.match(reset.text, /60 minutes/);
  assert.match(reset.html, /Reset password/);
  assertQuartermarkEmail(reset);
  assert.equal(refund.subject, 'CivicPath - Refund request received');
  assert.match(refund.text, /original payment method/);
  assertQuartermarkEmail(refund);
});

test('Council invitations use the shared Quartermark shell and a one-time access expectation', () => {
  const invitation = councilInvitationMessage({ firstName: 'Taylor', organizationName: 'Example Council', role: 'portfolio_manager', invitationUrl: 'https://app.civicpath.com.au/accept-invitation?token=example' });
  assert.equal(invitation.subject, 'CivicPath - You have been invited to a Council workspace');
  assert.match(invitation.text, /one-time email link/i);
  assert.match(invitation.text, /within 7 days/i);
  assert.match(invitation.html, /Set password and join/);
  assertQuartermarkEmail(invitation);
});

test('Stripe price selection permits only an approved mapped plan', () => {
  assert.equal(priceIdForPlan({ code: 'council-proof' }, { proofPriceId: 'price_proof' }), 'price_proof');
  assert.equal(priceIdForPlan({ code: 'essentials' }, { essentialsPriceId: 'price_essentials' }), 'price_essentials');
  assert.equal(priceIdForPlan({ code: 'civicpath-core' }, { corePriceId: 'price_core' }), 'price_core');
  assert.throws(() => priceIdForPlan({ code: 'civicpath-core' }, { corePriceId: '' }), BillingConfigurationError);
  assert.throws(() => priceIdForPlan({ code: 'unknown' }, {}), BillingConfigurationError);
});

test('checkout always applies Stripe Tax so Australian customers are charged GST, and refuses to run without it', () => {
  assert.deepEqual(checkoutTaxParameters({ settings: { automaticTaxEnabled: true }, priceId: 'price_core' }), { automatic_tax: { enabled: true }, line_items: [{ price: 'price_core', quantity: 1 }] });
  assert.throws(() => checkoutTaxParameters({ settings: { automaticTaxEnabled: false }, priceId: 'price_core' }), BillingConfigurationError);
});

test('Stripe period end and invoice payment intent are read from both pre-basil and basil API shapes', () => {
  assert.equal(subscriptionPeriodEnd({ current_period_end: 1_800_000_000 }).getTime(), 1_800_000_000_000);
  assert.equal(subscriptionPeriodEnd({ items: { data: [{ current_period_end: 1_800_000_000 }, { current_period_end: 1_700_000_000 }] } }).getTime(), 1_800_000_000_000);
  assert.equal(subscriptionPeriodEnd({ items: { data: [] } }), null);
  assert.equal(subscriptionPeriodEnd(null), null);
  assert.equal(invoicePaymentIntentId({ payment_intent: 'pi_legacy' }), 'pi_legacy');
  assert.equal(invoicePaymentIntentId({ payments: { data: [{ status: 'open', payment: { payment_intent: 'pi_open' } }, { status: 'paid', payment: { payment_intent: { id: 'pi_paid' } } }] } }), 'pi_paid');
  assert.equal(invoicePaymentIntentId({}), null);
});
