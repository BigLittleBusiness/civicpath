// Read models for subscription and invoice views shared by System Admin and council Workspace settings.
const DAY_MS = 24 * 60 * 60 * 1000;
export const AU_GST_RATE = 0.1;

function isCurrent(subscription, now = new Date()) {
  return subscription?.status === 'active' && (!subscription.endsAt || new Date(subscription.endsAt) > now);
}

// The subscription that currently governs access: the newest unexpired active one, otherwise the newest record that
// is not an abandoned checkout, otherwise the newest record. Callers pass every subscription for one organisation.
export function pickCurrentSubscription(subscriptions = []) {
  const newestFirst = [...subscriptions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return newestFirst.find((item) => isCurrent(item))
    || newestFirst.find((item) => item.status !== 'pending_checkout')
    || newestFirst[0]
    || null;
}

export function subscriptionView(subscription, { now = new Date() } = {}) {
  if (!subscription) return null;
  const plan = subscription.ProductPlan || null;
  const entitlements = subscription.entitlements || {};
  const endsAt = subscription.endsAt ? new Date(subscription.endsAt) : null;
  const isOneOff = plan?.code === 'council-proof';
  const daysRemaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / DAY_MS)) : null;
  const startsAt = subscription.startsAt ? new Date(subscription.startsAt) : null;
  const periodDays = startsAt && endsAt ? Math.max(1, Math.round((endsAt - startsAt) / DAY_MS)) : null;
  return {
    id: subscription.id,
    status: subscription.status,
    accessActive: isCurrent(subscription, now),
    planCode: plan?.code || null,
    planName: plan?.name || 'Subscription',
    annualPriceAud: plan ? Number(plan.annualPriceAud) : null,
    billingInterval: isOneOff ? 'one_off' : 'annual',
    billingProvider: subscription.billingProvider || null,
    isBilled: subscription.billingProvider === 'stripe',
    startsAt,
    endsAt,
    daysRemaining,
    periodProgress: periodDays && daysRemaining !== null ? Math.min(1, Math.max(0, 1 - daysRemaining / periodDays)) : null,
    cancelAtPeriodEnd: Boolean(entitlements.cancelAtPeriodEnd),
    renews: subscription.status === 'active' && !isOneOff && subscription.billingProvider === 'stripe' && !entitlements.cancelAtPeriodEnd,
    stripeStatus: entitlements.stripeStatus || null,
    stripeSubscriptionId: subscription.billingReference?.startsWith('sub_') ? subscription.billingReference : null,
  };
}

export function invoiceView(invoice) {
  const total = Number(invoice.amountPaid || invoice.amountDue || 0);
  return {
    id: invoice.id,
    number: invoice.invoiceNumber,
    status: invoice.status,
    currency: invoice.currency,
    subtotal: Number(invoice.amountSubtotal || 0) || Math.max(0, total - Number(invoice.amountTax || 0)),
    tax: Number(invoice.amountTax || 0),
    total,
    amountPaid: Number(invoice.amountPaid || 0),
    paidAt: invoice.paidAt,
    createdAt: invoice.createdAt,
    hostedInvoiceUrl: invoice.hostedInvoiceUrl,
    invoicePdfUrl: invoice.invoicePdfUrl,
    refundable: invoice.status === 'paid' && Boolean(invoice.stripePaymentIntentId),
  };
}

// AUD price shown with GST for Australian billing; NZ and other countries are not charged Australian GST.
export function priceWithGst(annualPriceAud, country) {
  if (annualPriceAud === null || annualPriceAud === undefined) return null;
  const gst = country === 'AU' ? Math.round(annualPriceAud * AU_GST_RATE * 100) / 100 : 0;
  return { excludingGst: annualPriceAud, gst, total: annualPriceAud + gst, gstApplies: country === 'AU' };
}

export function stripeDashboardUrl(mode, path) {
  return `https://dashboard.stripe.com/${mode === 'live' ? '' : 'test/'}${path}`;
}
