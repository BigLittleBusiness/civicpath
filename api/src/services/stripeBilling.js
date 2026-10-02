import Stripe from 'stripe';
import { PlatformSetting, ProductPlan } from '../models/index.js';
import { decryptConfiguration } from './encryption.js';

const PLAN_PRICE_KEYS = Object.freeze({
  'council-proof': 'proofPriceId',
  essentials: 'essentialsPriceId',
  'civicpath-core': 'corePriceId',
});

export class BillingConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'BillingConfigurationError';
  }
}

export async function getStripeBillingSettings({ includeSecrets = false } = {}) {
  const setting = await PlatformSetting.findOne({ where: { settingKey: 'stripe_billing' } });
  const configuration = setting?.configuration || {};
  const secrets = includeSecrets && setting?.encryptedPayload ? decryptConfiguration(setting.encryptedPayload) : {};
  return {
    mode: configuration.mode || 'test',
    publishableKey: configuration.publishableKey || '',
    corePriceId: configuration.corePriceId || '',
    essentialsPriceId: configuration.essentialsPriceId || '',
    proofPriceId: configuration.proofPriceId || '',
    customerPortalConfigurationId: configuration.customerPortalConfigurationId || '',
    automaticTaxEnabled: Boolean(configuration.automaticTaxEnabled),
    configured: Boolean(configuration.configured),
    secretKey: secrets.secretKey || '',
    webhookSecret: secrets.webhookSecret || '',
  };
}

export async function getStripeClient() {
  const settings = await getStripeBillingSettings({ includeSecrets: true });
  if (!settings.configured || !settings.secretKey || !settings.webhookSecret) {
    throw new BillingConfigurationError('Online billing is not configured yet. Please use the CivicPath contact form to arrange your Council Proof or subscription.');
  }
  const expectedPrefix = settings.mode === 'live' ? 'sk_live_' : 'sk_test_';
  if (!settings.secretKey.startsWith(expectedPrefix)) throw new BillingConfigurationError(`Stripe ${settings.mode} mode does not match the configured secret key.`);
  return { stripe: new Stripe(settings.secretKey), settings };
}

export function priceIdForPlan(plan, settings) {
  const key = PLAN_PRICE_KEYS[plan.code];
  const priceId = key ? settings[key] : '';
  if (!priceId) throw new BillingConfigurationError(`No approved Stripe Price ID has been mapped to the ${plan.name} plan.`);
  return priceId;
}

export function stripeStatusToCivicPath(status) {
  if (['active', 'trialing'].includes(status)) return 'active';
  if (['past_due', 'unpaid', 'incomplete'].includes(status)) return 'past_due';
  if (['canceled', 'incomplete_expired'].includes(status)) return 'cancelled';
  return 'pending_checkout';
}

export async function planForStripePrice(priceId) {
  if (!priceId) return null;
  const settings = await getStripeBillingSettings();
  const code = Object.entries(PLAN_PRICE_KEYS).find(([, key]) => settings[key] === priceId)?.[0];
  return code ? ProductPlan.findOne({ where: { code } }) : null;
}

// CivicPath prices are AUD excluding GST (Stripe Prices are tax_behavior "exclusive"), and Australian billing
// addresses must always attract 10% GST. Stripe Tax applies it from the billing address using the account's AU
// registration (NZ customers are not charged AU GST). Stripe has removed address-based dynamic tax rates, so there is
// no safe manual fallback: checkout is refused rather than risk an Australian sale without GST.
export function checkoutTaxParameters({ settings, priceId }) {
  if (!settings.automaticTaxEnabled) throw new BillingConfigurationError('Online checkout is unavailable until Stripe Tax is enabled for GST. Please use the CivicPath contact form to arrange your subscription.');
  return { automatic_tax: { enabled: true }, line_items: [{ price: priceId, quantity: 1 }] };
}

// Stripe API 2025-03-31.basil moved current_period_end from the subscription to its items; accept both shapes.
export function subscriptionPeriodEnd(subscription) {
  const seconds = subscription?.current_period_end || Math.max(0, ...(subscription?.items?.data || []).map((item) => Number(item.current_period_end || 0)));
  return seconds ? new Date(seconds * 1000) : null;
}

// Stripe API basil removed invoice.payment_intent in favour of invoice.payments (an expandable list).
export function invoicePaymentIntentId(invoice) {
  if (invoice?.payment_intent) return stripeSubscriptionId(invoice.payment_intent);
  const payments = invoice?.payments?.data || [];
  const paid = payments.find((entry) => entry.status === 'paid') || payments[0];
  return stripeSubscriptionId(paid?.payment?.payment_intent) || null;
}

// Total tax (GST) on an invoice: basil exposes total_taxes; earlier versions used tax / total_tax_amounts.
export function invoiceTaxAmount(invoice) {
  if (Array.isArray(invoice?.total_taxes)) return invoice.total_taxes.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  if (Number.isFinite(invoice?.tax)) return Number(invoice.tax);
  return (invoice?.total_tax_amounts || []).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
}

export function stripeCustomerId(value) {
  return typeof value === 'string' ? value : value?.id || null;
}

export function stripeSubscriptionId(value) {
  return typeof value === 'string' ? value : value?.id || null;
}
