import assert from 'node:assert/strict';
import test from 'node:test';
import { accountActivatedMessage, passwordResetMessage, registrationReceiptMessage } from '../src/services/accountNotifications.js';
import { BillingConfigurationError, priceIdForPlan } from '../src/services/stripeBilling.js';

test('registration and activation messages set clear CivicPath account expectations', () => {
  const receipt = registrationReceiptMessage({ firstName: 'Taylor', organisationName: 'Example Council', planName: 'CivicPath Core', checkoutUrl: 'https://checkout.stripe.test/example' });
  const activation = accountActivatedMessage({ firstName: 'Taylor', organisationName: 'Example Council', planName: 'CivicPath Core', signInUrl: 'https://app.civicpath.com.au/login' });
  assert.equal(receipt.subject, 'CivicPath - Complete your secure subscription checkout');
  assert.match(receipt.text, /secure Stripe checkout/);
  assert.match(receipt.text, /activated only after Stripe confirms payment/);
  assert.equal(activation.subject, 'CivicPath - Your Council workspace is active');
  assert.match(activation.text, /Stripe has confirmed payment/);
});

test('password reset messages use a direct, time-bound account link', () => {
  const reset = passwordResetMessage({ firstName: 'Taylor', resetUrl: 'https://app.civicpath.com.au/reset-password?token=abc' });
  assert.equal(reset.subject, 'CivicPath - Reset your password');
  assert.match(reset.text, /60 minutes/);
  assert.match(reset.html, /Reset password/);
});

test('Stripe price selection permits only an approved mapped plan', () => {
  assert.equal(priceIdForPlan({ code: 'council-proof' }, { proofPriceId: 'price_proof' }), 'price_proof');
  assert.equal(priceIdForPlan({ code: 'essentials' }, { essentialsPriceId: 'price_essentials' }), 'price_essentials');
  assert.equal(priceIdForPlan({ code: 'civicpath-core' }, { corePriceId: 'price_core' }), 'price_core');
  assert.throws(() => priceIdForPlan({ code: 'civicpath-core' }, { corePriceId: '' }), BillingConfigurationError);
  assert.throws(() => priceIdForPlan({ code: 'unknown' }, {}), BillingConfigurationError);
});
