import Joi from 'joi';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { AuditLog, BillingEvent, BillingInvoice, BillingProfile, BillingRefund, Organization, ProductPlan, Subscription, User } from '../models/index.js';
import { accountActivatedMessage, refundRequestedMessage, sendTransactionalEmail } from '../services/accountNotifications.js';
import { BillingConfigurationError, checkoutTaxParameters, getStripeBillingSettings, getStripeClient, invoicePaymentIntentId, invoiceTaxAmount, planForStripePrice, priceIdForPlan, stripeCustomerId, stripeStatusToCivicPath, stripeSubscriptionId, subscriptionPeriodEnd } from '../services/stripeBilling.js';
import { env } from '../config/env.js';
import { invoiceView, pickCurrentSubscription, priceWithGst, stripeDashboardUrl, subscriptionView } from '../services/billingSummary.js';

const changePlanSchema = Joi.object({ planCode: Joi.string().valid('council-proof', 'essentials', 'civicpath-core').required() });
const councilProofConversionSchema = Joi.object({ targetPlanCode: Joi.string().valid('essentials', 'civicpath-core').required() });
const cancellationSchema = Joi.object({ when: Joi.string().valid('period_end', 'immediate').default('period_end'), reason: Joi.string().trim().min(8).max(1000).required() });
const refundSchema = Joi.object({ invoiceId: Joi.string().uuid().required(), amount: Joi.number().positive().precision(2).allow(null), reason: Joi.string().valid('duplicate', 'fraudulent', 'requested_by_customer').default('requested_by_customer'), adminNote: Joi.string().trim().min(8).max(2000).required() });

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

function money(amount, currency = 'AUD') {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: currency.toUpperCase() }).format(Number(amount || 0) / 100);
}

async function platformAudit(req, organizationId, action, metadata = {}) {
  return AuditLog.create({ organizationId, userId: req.auth?.sub || null, entityType: 'billing', entityId: organizationId, action, metadata, ipAddress: req.ip }).catch(() => null);
}

async function organisationForStripe({ customerId, metadata = {} }) {
  if (metadata.civicpathOrganizationId) return Organization.findByPk(metadata.civicpathOrganizationId);
  if (customerId) {
    const profile = await BillingProfile.findOne({ where: { stripeCustomerId: customerId } });
    if (profile) return Organization.findByPk(profile.organizationId);
  }
  return null;
}

async function localSubscriptionForStripe({ organizationId, stripeSubscription }) {
  if (!organizationId) return null;
  if (stripeSubscription) {
    const byReference = await Subscription.findOne({ where: { organizationId, billingReference: stripeSubscription } });
    if (byReference) return byReference;
  }
  return Subscription.findOne({ where: { organizationId }, order: [['createdAt', 'DESC']] });
}

async function upsertInvoice(invoice, organizationId, subscriptionId = null) {
  if (!invoice?.id || !organizationId) return null;
  const values = {
    organizationId,
    subscriptionId,
    stripeInvoiceId: invoice.id,
    stripeCustomerId: stripeCustomerId(invoice.customer),
    stripePaymentIntentId: invoicePaymentIntentId(invoice),
    invoiceNumber: invoice.number || null,
    status: invoice.status || 'unknown',
    currency: String(invoice.currency || 'aud').toUpperCase(),
    amountDue: Number(invoice.amount_due || 0),
    amountPaid: Number(invoice.amount_paid || 0),
    amountRemaining: Number(invoice.amount_remaining || 0),
    amountSubtotal: Number(invoice.subtotal || 0),
    amountTax: invoiceTaxAmount(invoice),
    hostedInvoiceUrl: invoice.hosted_invoice_url || null,
    invoicePdfUrl: invoice.invoice_pdf || null,
    dueAt: invoice.due_date ? new Date(invoice.due_date * 1000) : null,
    paidAt: invoice.status_transitions?.paid_at ? new Date(invoice.status_transitions.paid_at * 1000) : null,
  };
  const existing = await BillingInvoice.findOne({ where: { stripeInvoiceId: invoice.id } });
  if (existing) { await existing.update(values); return existing; }
  return BillingInvoice.create(values);
}

async function activateVerifiedPurchase({ organization, subscription, plan, stripeSubscription, eventId }) {
  if (!organization || !subscription) return null;
  const wasInactive = subscription.status !== 'active';
  const endAt = subscriptionPeriodEnd(stripeSubscription) || (plan?.code === 'council-proof' ? new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) : subscription.endsAt);
  await subscription.update({ planId: plan?.id || subscription.planId, status: 'active', billingProvider: 'stripe', billingReference: stripeSubscription?.id || subscription.billingReference, startsAt: subscription.startsAt || new Date(), endsAt: endAt, entitlements: { ...(subscription.entitlements || {}), stripeStatus: stripeSubscription?.status || 'paid', lastVerifiedEventId: eventId, verifiedAt: new Date().toISOString() } });
  await organization.update({ status: 'active', planCode: plan?.code || organization.planCode });
  const invitedUsers = await User.findAll({ where: { organizationId: organization.id, status: 'invited' } });
  if (invitedUsers.length) await User.update({ status: 'active' }, { where: { id: { [Op.in]: invitedUsers.map((user) => user.id) } } });
  await AuditLog.create({ organizationId: organization.id, userId: null, entityType: 'billing', entityId: subscription.id, action: 'stripe_payment_verified_access_activated', metadata: { stripeEventId: eventId, planCode: plan?.code || organization.planCode, stripeSubscriptionId: stripeSubscription?.id || null } });
  if (wasInactive && invitedUsers.length) {
    const primary = invitedUsers[0];
    await sendTransactionalEmail({ to: primary.email, message: accountActivatedMessage({ firstName: primary.firstName, organisationName: organization.name, planName: plan?.name || 'CivicPath', signInUrl: new URL('/login', env.frontendUrl).toString() }) });
  }
  return subscription;
}

async function deactivateAccess({ organization, subscription, eventId, status = 'cancelled' }) {
  if (!organization || !subscription) return;
  await subscription.update({ status, entitlements: { ...(subscription.entitlements || {}), lastVerifiedEventId: eventId, accessStoppedAt: new Date().toISOString() } });
  await organization.update({ status: 'suspended' });
  await User.increment('sessionVersion', { where: { organizationId: organization.id, role: { [Op.ne]: 'platform_admin' } } });
  await AuditLog.create({ organizationId: organization.id, userId: null, entityType: 'billing', entityId: subscription.id, action: 'stripe_access_deactivated', metadata: { stripeEventId: eventId, status } });
}

async function resolvePlanForSubscription(stripeSubscription) {
  const priceId = stripeSubscription?.items?.data?.[0]?.price?.id || null;
  return planForStripePrice(priceId);
}

// Records the event once. Stripe may deliver the same event concurrently (retries, or several listeners), so the
// unique stripe_event_id decides which delivery processes it; a later delivery may only retry a failed attempt.
async function claimBillingEvent(values) {
  try { return await BillingEvent.create(values); }
  catch (error) {
    if (error.name !== 'SequelizeUniqueConstraintError') throw error;
    const [claimed] = await BillingEvent.update({ processingStatus: 'received', error: null }, { where: { stripeEventId: values.stripeEventId, processingStatus: 'failed' } });
    return claimed ? BillingEvent.findOne({ where: { stripeEventId: values.stripeEventId } }) : null;
  }
}

async function processStripeEvent(event) {
  const type = event.type;
  const object = event.data?.object || {};
  const metadata = object.metadata || {};
  const customerId = stripeCustomerId(object.customer);
  const stripeSubId = stripeSubscriptionId(object.subscription) || stripeSubscriptionId(object.parent?.subscription_details?.subscription) || (type.startsWith('customer.subscription.') ? object.id : null);
  const organization = await organisationForStripe({ customerId, metadata });
  const billingEvent = await claimBillingEvent({ organizationId: organization?.id || null, stripeEventId: event.id, eventType: type, stripeCustomerId: customerId, stripeSubscriptionId: stripeSubId, payload: { apiVersion: event.api_version, created: event.created, objectId: object.id, livemode: event.livemode } });
  if (!billingEvent) return { state: 'duplicate' };
  try {
    if (!organization) {
      await billingEvent.update({ processingStatus: 'ignored', processedAt: new Date(), error: 'No CivicPath organization matched this Stripe event.' });
      return { state: 'ignored' };
    }
    const subscription = await localSubscriptionForStripe({ organizationId: organization.id, stripeSubscription: stripeSubId });
    if (type === 'checkout.session.completed') {
      const sessionSubscriptionId = stripeSubscriptionId(object.subscription);
      if (subscription) await subscription.update({ billingReference: sessionSubscriptionId || subscription.billingReference, entitlements: { ...(subscription.entitlements || {}), stripeCheckoutSessionId: object.id, stripePaymentStatus: object.payment_status } });
      // For the separately scoped Council Proof payment, this is the verified payment event and access can begin immediately.
      if (object.mode === 'payment' && object.payment_status === 'paid' && subscription) {
        const plan = await ProductPlan.findOne({ where: { id: subscription.planId } });
        await activateVerifiedPurchase({ organization, subscription, plan, stripeSubscription: null, eventId: event.id });
      }
    } else if (type === 'invoice.paid') {
      // Re-read from Stripe at the SDK's API version: the event payload omits invoice.payments (needed for refunds)
      // and may be rendered at a different API version than this code expects.
      const { stripe } = await getStripeClient();
      const paidInvoice = await stripe.invoices.retrieve(object.id, { expand: ['payments'] });
      const stripeSubscription = stripeSubId ? await stripe.subscriptions.retrieve(stripeSubId) : null;
      const plan = await resolvePlanForSubscription(stripeSubscription) || (subscription ? await ProductPlan.findByPk(subscription.planId) : null);
      const activeSubscription = subscription || await localSubscriptionForStripe({ organizationId: organization.id });
      const invoice = await upsertInvoice(paidInvoice, organization.id, activeSubscription?.id || null);
      if (activeSubscription) await activateVerifiedPurchase({ organization, subscription: activeSubscription, plan, stripeSubscription, eventId: event.id });
      await AuditLog.create({ organizationId: organization.id, userId: null, entityType: 'billing_invoice', entityId: invoice?.id || null, action: 'stripe_invoice_paid', metadata: { stripeEventId: event.id, stripeInvoiceId: object.id, amountPaid: object.amount_paid, currency: object.currency } });
    } else if (type === 'invoice.payment_failed') {
      const invoice = await upsertInvoice(object, organization.id, subscription?.id || null);
      if (subscription) await deactivateAccess({ organization, subscription, eventId: event.id, status: 'past_due' });
      await AuditLog.create({ organizationId: organization.id, userId: null, entityType: 'billing_invoice', entityId: invoice?.id || null, action: 'stripe_invoice_payment_failed', metadata: { stripeEventId: event.id, stripeInvoiceId: object.id } });
    } else if (type === 'customer.subscription.updated') {
      const plan = await resolvePlanForSubscription(object);
      if (subscription) {
        const status = stripeStatusToCivicPath(object.status);
        await subscription.update({ planId: plan?.id || subscription.planId, status, billingReference: object.id, endsAt: subscriptionPeriodEnd(object) || subscription.endsAt, entitlements: { ...(subscription.entitlements || {}), stripeStatus: object.status, cancelAtPeriodEnd: Boolean(object.cancel_at_period_end), currentPeriodEnd: subscriptionPeriodEnd(object)?.toISOString() || null } });
        if (plan) await organization.update({ planCode: plan.code });
        if (status === 'active') await organization.update({ status: 'active' });
      }
    } else if (type === 'customer.subscription.deleted') {
      if (subscription) await deactivateAccess({ organization, subscription, eventId: event.id, status: 'cancelled' });
    } else if (type === 'invoice.created' || type === 'invoice.finalized' || type === 'invoice.updated') {
      await upsertInvoice(object, organization.id, subscription?.id || null);
    } else if (type === 'refund.created' || type === 'refund.updated' || type === 'refund.failed') {
      const invoice = object.payment_intent ? await BillingInvoice.findOne({ where: { stripePaymentIntentId: object.payment_intent } }) : null;
      const existing = await BillingRefund.findOne({ where: { stripeRefundId: object.id } });
      const values = { organizationId: organization.id, invoiceId: invoice?.id || null, stripeRefundId: object.id, stripePaymentIntentId: stripeSubscriptionId(object.payment_intent), amount: Number(object.amount || 0), currency: String(object.currency || 'aud').toUpperCase(), status: object.status || 'pending', reason: object.reason || null, providerReference: object.id };
      if (existing) await existing.update(values); else await BillingRefund.create(values);
    }
    await billingEvent.update({ processingStatus: 'processed', processedAt: new Date(), error: null });
    return { state: 'processed', organizationId: organization.id };
  } catch (error) {
    await billingEvent.update({ processingStatus: 'failed', error: String(error.message || error).slice(0, 1000) });
    throw error;
  }
}

export async function stripeWebhook(req, res, next) {
  try {
    const settings = await getStripeBillingSettings({ includeSecrets: true });
    if (!settings.configured || !settings.secretKey || !settings.webhookSecret) return res.status(503).json({ error: 'Stripe webhook handling is not configured.' });
    const { stripe } = await getStripeClient();
    let event;
    try { event = stripe.webhooks.constructEvent(req.body, req.get('stripe-signature'), settings.webhookSecret); }
    catch { return res.status(400).json({ error: 'Stripe webhook signature could not be verified.' }); }
    const result = await processStripeEvent(event);
    return res.status(200).json({ data: { received: true, duplicate: result.state === 'duplicate' } });
  } catch (error) { return next(error); }
}

export async function createCustomerPortal(req, res, next) {
  try {
    const profile = await BillingProfile.findOne({ where: { organizationId: req.tenant.organizationId } });
    if (!profile?.stripeCustomerId) return res.status(422).json({ error: 'A Stripe billing customer is not available for this workspace yet.' });
    const { stripe, settings } = await getStripeClient();
    const session = await stripe.billingPortal.sessions.create({ customer: profile.stripeCustomerId, return_url: new URL('/settings', env.frontendUrl).toString(), configuration: settings.customerPortalConfigurationId || undefined });
    await platformAudit(req, req.tenant.organizationId, 'stripe_customer_portal_opened', { stripeCustomerId: profile.stripeCustomerId });
    return res.json({ data: { url: session.url } });
  } catch (error) { return next(error); }
}

export async function startCouncilProofConversionCheckout(req, res, next) {
  try {
    const { value, error } = councilProofConversionSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const organization = await Organization.findByPk(req.tenant.organizationId);
    const profile = await BillingProfile.findOne({ where: { organizationId: req.tenant.organizationId } });
    const proofSubscription = await Subscription.findOne({ where: { organizationId: req.tenant.organizationId, status: 'active' }, include: [{ model: ProductPlan }], order: [['createdAt', 'DESC']] });
    if (!organization || !profile?.stripeCustomerId || proofSubscription?.ProductPlan?.code !== 'council-proof') return res.status(422).json({ error: 'A verified Council Proof workspace is required before its conversion credit can be used.' });
    const proofEndsAt = proofSubscription.endsAt ? new Date(proofSubscription.endsAt) : null;
    const conversionDeadline = proofEndsAt ? new Date(proofEndsAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null;
    if (!conversionDeadline || conversionDeadline < new Date()) return res.status(422).json({ error: 'The 30-day Council Proof conversion-credit window has ended. Please use the billing contact form to discuss next steps.' });
    const targetPlan = await ProductPlan.findOne({ where: { code: value.targetPlanCode, product: 'civicpath', isActive: true } });
    if (!targetPlan) return res.status(422).json({ error: 'The CivicPath annual plan is not currently available.' });
    const { stripe, settings } = await getStripeClient();
    const targetPriceId = priceIdForPlan(targetPlan, settings);
    const taxParameters = checkoutTaxParameters({ settings, priceId: targetPriceId }); // Validated before the coupon is created.
    const coupon = await stripe.coupons.create({ amount_off: 49500, currency: 'aud', duration: 'once', name: 'Council Proof conversion credit', metadata: { civicpathOrganizationId: organization.id, proofSubscriptionId: proofSubscription.id, conversionDeadline: conversionDeadline.toISOString() } });
    const nextSubscription = await Subscription.create({ organizationId: organization.id, planId: targetPlan.id, status: 'pending_checkout', startsAt: new Date(), billingProvider: 'stripe', entitlements: { pendingReason: 'Council Proof conversion checkout', conversionCreditAud: 495, proofSubscriptionId: proofSubscription.id } });
    const session = await stripe.checkout.sessions.create({ mode: 'subscription', customer: profile.stripeCustomerId, ...taxParameters, discounts: [{ coupon: coupon.id }], billing_address_collection: 'required', tax_id_collection: { enabled: true }, customer_update: { address: 'auto', name: 'auto' }, success_url: `${new URL('/registration/success', env.frontendUrl).toString()}?session_id={CHECKOUT_SESSION_ID}`, cancel_url: new URL('/settings', env.frontendUrl).toString(), metadata: { civicpathOrganizationId: organization.id, civicpathUserId: req.auth.sub, civicpathSubscriptionId: nextSubscription.id, civicpathPlanCode: targetPlan.code, councilProofConversionCreditAud: '495' }, subscription_data: { metadata: { civicpathOrganizationId: organization.id, civicpathUserId: req.auth.sub, civicpathSubscriptionId: nextSubscription.id, civicpathPlanCode: targetPlan.code, councilProofConversionCreditAud: '495' } } });
    await nextSubscription.update({ billingReference: session.id, entitlements: { ...(nextSubscription.entitlements || {}), stripeCheckoutSessionId: session.id, stripeCouponId: coupon.id } });
    await platformAudit(req, organization.id, 'council_proof_conversion_checkout_created', { proofSubscriptionId: proofSubscription.id, newSubscriptionId: nextSubscription.id, stripeCheckoutSessionId: session.id, stripeCouponId: coupon.id });
    return res.json({ data: { checkoutUrl: session.url, conversionCreditAud: 495 } });
  } catch (error) { return next(error); }
}

export async function customerBillingSummary(req, res, next) {
  try {
    const organizationId = req.params.customerId;
    const [profile, subscriptions, invoices, refunds, events] = await Promise.all([
      BillingProfile.findOne({ where: { organizationId } }),
      Subscription.findAll({ where: { organizationId }, include: [{ model: ProductPlan }], order: [['createdAt', 'DESC']] }),
      BillingInvoice.findAll({ where: { organizationId }, order: [['createdAt', 'DESC']], limit: 50 }),
      BillingRefund.findAll({ where: { organizationId }, order: [['createdAt', 'DESC']], limit: 50 }),
      BillingEvent.findAll({ where: { organizationId }, order: [['createdAt', 'DESC']], limit: 50, attributes: ['id', 'eventType', 'stripeEventId', 'processingStatus', 'error', 'createdAt', 'processedAt'] }),
    ]);
    const organization = await Organization.findByPk(organizationId, { attributes: ['country'] });
    const settings = await getStripeBillingSettings();
    const current = subscriptionView(pickCurrentSubscription(subscriptions));
    return res.json({ data: {
      profile, subscriptions, refunds, events,
      current,
      pricing: priceWithGst(current?.annualPriceAud ?? null, profile?.billingAddress?.country || organization?.country),
      invoices: invoices.map((invoice) => ({ ...invoiceView(invoice), stripePaymentIntentId: invoice.stripePaymentIntentId, amountDue: invoice.amountDue })),
      stripeLinks: {
        customer: profile?.stripeCustomerId ? stripeDashboardUrl(settings.mode, `customers/${profile.stripeCustomerId}`) : null,
        subscription: current?.stripeSubscriptionId ? stripeDashboardUrl(settings.mode, `subscriptions/${current.stripeSubscriptionId}`) : null,
      },
    } });
  } catch (error) { return next(error); }
}

// Council-facing subscription summary. Every workspace role sees the plan and access period; only the organisation
// administrator (who holds billing authority) receives invoices and billing actions.
export async function councilSubscriptionSummary(req, res, next) {
  try {
    const organizationId = req.tenant.organizationId;
    const isBillingAdmin = req.auth.role === 'org_admin';
    const [organization, profile, subscriptions, invoices] = await Promise.all([
      Organization.findByPk(organizationId, { attributes: ['id', 'name', 'country', 'isDemo'] }),
      BillingProfile.findOne({ where: { organizationId } }),
      Subscription.findAll({ where: { organizationId }, include: [{ model: ProductPlan }], order: [['createdAt', 'DESC']] }),
      isBillingAdmin ? BillingInvoice.findAll({ where: { organizationId }, order: [['createdAt', 'DESC']], limit: 12 }) : [],
    ]);
    const current = subscriptionView(pickCurrentSubscription(subscriptions));
    const billingCountry = profile?.billingAddress?.country || organization?.country;
    let conversion = null;
    if (current?.planCode === 'council-proof' && current.accessActive && current.endsAt) {
      const deadline = new Date(current.endsAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      conversion = { creditAud: 495, deadline, available: isBillingAdmin && Boolean(profile?.stripeCustomerId) && deadline > new Date() };
    }
    return res.json({ data: {
      organisation: { name: organization?.name, isDemo: Boolean(organization?.isDemo) },
      subscription: current,
      pricing: priceWithGst(current?.annualPriceAud ?? null, billingCountry),
      billingAdmin: isBillingAdmin,
      billingEmail: isBillingAdmin ? profile?.billingEmail || null : undefined,
      portalAvailable: isBillingAdmin && Boolean(profile?.stripeCustomerId),
      invoices: invoices.map(invoiceView),
      conversion,
    } });
  } catch (error) { return next(error); }
}

export async function changeCustomerPlan(req, res, next) {
  try {
    const { value, error } = changePlanSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const customer = await Organization.findByPk(req.params.customerId);
    if (!customer || customer.isDemo) return res.status(404).json({ error: 'Billable customer organisation not found.' });
    const [profile, current, nextPlan] = await Promise.all([
      BillingProfile.findOne({ where: { organizationId: customer.id } }),
      Subscription.findOne({ where: { organizationId: customer.id, billingProvider: 'stripe', status: 'active' }, include: [{ model: ProductPlan }], order: [['createdAt', 'DESC']] }),
      ProductPlan.findOne({ where: { code: value.planCode, product: 'civicpath', isActive: true } }),
    ]);
    if (!profile?.stripeCustomerId || !current?.billingReference || !nextPlan || current.ProductPlan?.code === 'council-proof') return res.status(422).json({ error: 'This customer does not have an active annual Stripe subscription available for a plan change.' });
    const { stripe, settings } = await getStripeClient();
    const targetPrice = priceIdForPlan(nextPlan, settings);
    const stripeSubscription = await stripe.subscriptions.retrieve(current.billingReference);
    const item = stripeSubscription.items.data[0];
    const updated = await stripe.subscriptions.update(stripeSubscription.id, { items: [{ id: item.id, price: targetPrice }], proration_behavior: 'always_invoice', metadata: { civicpathOrganizationId: customer.id, civicpathPlanCode: nextPlan.code } });
    await current.update({ planId: nextPlan.id, entitlements: { ...(current.entitlements || {}), planChangeRequestedAt: new Date().toISOString(), requestedPlanCode: nextPlan.code, stripeStatus: updated.status } });
    await customer.update({ planCode: nextPlan.code });
    await platformAudit(req, customer.id, 'stripe_plan_change_requested', { fromPlanId: current.planId, toPlanCode: nextPlan.code, stripeSubscriptionId: updated.id, prorationBehavior: 'always_invoice' });
    return res.json({ data: { subscription: current, requestedPlan: nextPlan.code, message: 'Stripe has received the immediate plan change. Any applicable adjustment is handled through Stripe.' } });
  } catch (error) { return next(error); }
}

export async function cancelCustomerPlan(req, res, next) {
  try {
    const { value, error } = cancellationSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const customer = await Organization.findByPk(req.params.customerId);
    const subscription = customer ? await Subscription.findOne({ where: { organizationId: customer.id, billingProvider: 'stripe', status: ['active', 'past_due'] }, order: [['createdAt', 'DESC']] }) : null;
    if (!customer || !subscription?.billingReference) return res.status(404).json({ error: 'A Stripe subscription was not found for this customer.' });
    const { stripe } = await getStripeClient();
    const result = value.when === 'immediate'
      ? await stripe.subscriptions.cancel(subscription.billingReference)
      : await stripe.subscriptions.update(subscription.billingReference, { cancel_at_period_end: true });
    if (value.when === 'immediate') await deactivateAccess({ organization: customer, subscription, eventId: `admin_cancel_${Date.now()}`, status: 'cancelled' });
    else await subscription.update({ entitlements: { ...(subscription.entitlements || {}), cancelAtPeriodEnd: true, cancellationReason: value.reason, currentPeriodEnd: subscriptionPeriodEnd(result)?.toISOString() || null } });
    await platformAudit(req, customer.id, 'stripe_subscription_cancellation_requested', { when: value.when, reason: value.reason, stripeSubscriptionId: result.id });
    return res.json({ data: { cancelled: value.when === 'immediate', endsAt: subscriptionPeriodEnd(result) } });
  } catch (error) { return next(error); }
}

export async function refundCustomerInvoice(req, res, next) {
  try {
    const { value, error } = refundSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const customer = await Organization.findByPk(req.params.customerId);
    const invoice = customer ? await BillingInvoice.findOne({ where: { id: value.invoiceId, organizationId: customer.id } }) : null;
    if (!customer || !invoice?.stripePaymentIntentId || invoice.amountPaid < 1) return res.status(422).json({ error: 'A paid Stripe invoice with a refundable payment could not be found.' });
    const requestedAmount = value.amount ? cents(value.amount) : invoice.amountPaid;
    if (requestedAmount < 1 || requestedAmount > invoice.amountPaid) return res.status(422).json({ error: 'The refund amount must be greater than zero and cannot exceed the paid invoice amount.' });
    const { stripe } = await getStripeClient();
    const refund = await stripe.refunds.create({ payment_intent: invoice.stripePaymentIntentId, amount: requestedAmount, reason: value.reason, metadata: { civicpathOrganizationId: customer.id, civicpathInvoiceId: invoice.id, requestedBy: req.auth.sub } });
    const local = await BillingRefund.create({ organizationId: customer.id, invoiceId: invoice.id, requestedBy: req.auth.sub, stripeRefundId: refund.id, stripePaymentIntentId: invoice.stripePaymentIntentId, amount: requestedAmount, currency: invoice.currency, status: refund.status, reason: refund.reason || value.reason, adminNote: value.adminNote, providerReference: refund.id });
    await platformAudit(req, customer.id, 'stripe_refund_requested', { invoiceId: invoice.id, stripeRefundId: refund.id, amount: requestedAmount, currency: invoice.currency, reason: value.reason, adminNote: value.adminNote });
    const primary = await User.findOne({ where: { organizationId: customer.id, role: 'org_admin', status: 'active' }, order: [['createdAt', 'ASC']] });
    if (primary) await sendTransactionalEmail({ to: primary.email, message: refundRequestedMessage({ firstName: primary.firstName, amountLabel: money(requestedAmount, invoice.currency), organisationName: customer.name }) });
    return res.status(201).json({ data: local });
  } catch (error) { return next(error); }
}

export { BillingConfigurationError, processStripeEvent, upsertInvoice };
