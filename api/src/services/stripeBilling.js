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

export function stripeCustomerId(value) {
  return typeof value === 'string' ? value : value?.id || null;
}

export function stripeSubscriptionId(value) {
  return typeof value === 'string' ? value : value?.id || null;
}
