import Joi from 'joi';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { sequelize } from '../config/database.js';
import { BillingProfile, Organization, PasswordResetToken, ProductPlan, Subscription, User, AuditLog } from '../models/index.js';
import { consumeAltchaPayload, fingerprint, issueAltchaChallenge } from '../services/altchaProtection.js';
import { accountActivatedMessage, createSecureToken, hashToken, passwordResetMessage, registrationReceiptMessage, sendTransactionalEmail } from '../services/accountNotifications.js';
import { BillingConfigurationError, checkoutTaxParameters, getStripeClient, priceIdForPlan } from '../services/stripeBilling.js';
import { env } from '../config/env.js';

const registrationSchema = Joi.object({
  firstName: Joi.string().trim().min(1).max(80).required(),
  lastName: Joi.string().trim().min(1).max(80).required(),
  email: Joi.string().trim().lowercase().email().max(191).required(),
  password: Joi.string().min(12).max(200).required(),
  organisationName: Joi.string().trim().min(2).max(160).required(),
  country: Joi.string().valid('AU', 'NZ').required(),
  stateRegion: Joi.string().trim().max(100).allow('', null),
  roleTitle: Joi.string().trim().max(160).allow('', null),
  phone: Joi.string().trim().max(50).allow('', null),
  abnNzbn: Joi.string().trim().max(40).allow('', null),
  planCode: Joi.string().valid('council-proof', 'essentials', 'civicpath-core').required(),
  termsAccepted: Joi.boolean().valid(true).required(),
  privacyAccepted: Joi.boolean().valid(true).required(),
  altcha: Joi.string().trim().min(1).max(16_000).required(),
  honeypot: Joi.string().allow('').max(0).default(''),
});

const resetRequestSchema = Joi.object({ email: Joi.string().trim().lowercase().email().max(191).required(), altcha: Joi.string().trim().min(1).max(16_000).required(), honeypot: Joi.string().allow('').max(0).default('') });
const resetConfirmSchema = Joi.object({ token: Joi.string().trim().min(20).max(200).required(), password: Joi.string().min(12).max(200).required() });

function organisationSlug(name) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 76) || 'council';
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

function appUrl(path) {
  return new URL(path, env.frontendUrl).toString();
}

async function auditRegistration({ organizationId, userId, action, req, metadata = {} }) {
  return AuditLog.create({ organizationId, userId, entityType: 'account_lifecycle', entityId: userId || organizationId, action, metadata, ipAddress: req.ip }).catch(() => null);
}

export async function getAccountChallenge(req, res, next) {
  try {
    const map = { registration: 'account_registration', password_reset: 'password_reset' };
    const purpose = map[String(req.query.purpose || '')];
    if (!purpose) return res.status(422).json({ error: 'The requested account form is not available.' });
    return res.json(await issueAltchaChallenge({ purpose, req }));
  } catch (error) { return next(error); }
}

export async function publicPlans(_req, res, next) {
  try {
    const plans = await ProductPlan.findAll({ where: { product: 'civicpath', isActive: true }, order: [['annualPriceAud', 'ASC']] });
    return res.json({ data: plans.map((plan) => ({ code: plan.code, name: plan.name, annualPriceAud: Number(plan.annualPriceAud), workflowUserLimit: plan.workflowUserLimit, activeProjectLimit: plan.activeProjectLimit, features: plan.features })) });
  } catch (error) { return next(error); }
}

export async function registerAndStartCheckout(req, res, next) {
  try {
    const { value, error } = registrationSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(422).json({ error: 'Please review the highlighted registration fields.', details: error.details.map((item) => item.message) });
    if (value.honeypot) return res.status(422).json({ error: 'Registration could not be completed.' });

    const existing = await User.findOne({ where: { email: value.email, deletedAt: null } });
    if (existing) return res.status(409).json({ error: 'A CivicPath account already uses this email address. Sign in or reset your password instead.' });
    const plan = await ProductPlan.findOne({ where: { code: value.planCode, product: 'civicpath', isActive: true } });
    if (!plan) return res.status(422).json({ error: 'The selected CivicPath plan is not currently available.' });

    const { stripe, settings } = await getStripeClient();
    const priceId = priceIdForPlan(plan, settings);
    const taxParameters = checkoutTaxParameters({ settings, priceId }); // Validated before any record or Stripe customer is created.
    const passwordHash = await bcrypt.hash(value.password, 12);

    const registration = await sequelize.transaction(async (transaction) => {
      await consumeAltchaPayload({ encodedPayload: value.altcha, purpose: 'account_registration', transaction });
      const organization = await Organization.create({
        name: value.organisationName,
        slug: organisationSlug(value.organisationName),
        country: value.country,
        organisationType: 'council',
        planCode: plan.code,
        defaultCurrency: value.country === 'NZ' ? 'NZD' : 'AUD',
        status: 'trial',
      }, { transaction });
      const user = await User.create({ organizationId: organization.id, email: value.email, firstName: value.firstName, lastName: value.lastName, passwordHash, role: 'org_admin', status: 'invited' }, { transaction });
      const subscription = await Subscription.create({ organizationId: organization.id, planId: plan.id, status: 'pending_checkout', startsAt: new Date(), billingProvider: 'stripe', entitlements: { pendingReason: 'Awaiting verified Stripe payment' } }, { transaction });
      const profile = await BillingProfile.create({ organizationId: organization.id, legalName: value.organisationName, abnNzbn: value.abnNzbn || null, billingEmail: value.email, contactPhone: value.phone || null, billingAddress: { country: value.country, stateRegion: value.stateRegion || null, roleTitle: value.roleTitle || null } }, { transaction });
      await auditRegistration({ organizationId: organization.id, userId: user.id, action: 'registration_created', req, metadata: { planCode: plan.code, country: value.country, termsAccepted: true, privacyAccepted: true } });
      return { organization, user, subscription, profile };
    });

    try {
      const customer = await stripe.customers.create({ name: registration.organization.name, email: registration.user.email, phone: value.phone || undefined, metadata: { civicpathOrganizationId: registration.organization.id, civicpathUserId: registration.user.id } });
      await registration.profile.update({ stripeCustomerId: customer.id });
      const isCouncilProof = plan.code === 'council-proof';
      const session = await stripe.checkout.sessions.create({
        mode: isCouncilProof ? 'payment' : 'subscription',
        customer: customer.id,
        client_reference_id: registration.organization.id,
        ...taxParameters,
        success_url: `${appUrl('/registration/success')}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${appUrl('/register')}?checkout=cancelled`,
        billing_address_collection: 'required',
        tax_id_collection: { enabled: true },
        customer_update: { address: 'auto', name: 'auto' },
        // One-off Council Proof payments otherwise produce no invoice; a tax invoice showing GST is required.
        invoice_creation: isCouncilProof ? { enabled: true, invoice_data: { metadata: { civicpathOrganizationId: registration.organization.id, civicpathPlanCode: plan.code } } } : undefined,
        metadata:{ civicpathOrganizationId: registration.organization.id, civicpathUserId: registration.user.id, civicpathSubscriptionId: registration.subscription.id, civicpathPlanCode: plan.code, lifecycleVersion: '1' },
        subscription_data: isCouncilProof ? undefined : { metadata: { civicpathOrganizationId: registration.organization.id, civicpathUserId: registration.user.id, civicpathSubscriptionId: registration.subscription.id, civicpathPlanCode: plan.code } },
      });
      await registration.subscription.update({ billingReference: session.subscription || session.id, entitlements: { pendingReason: 'Awaiting verified Stripe payment', stripeCheckoutSessionId: session.id } });
      await auditRegistration({ organizationId: registration.organization.id, userId: registration.user.id, action: 'stripe_checkout_created', req, metadata: { checkoutSessionId: session.id, planCode: plan.code, mode: session.mode } });
      await sendTransactionalEmail({ to: registration.user.email, organizationId: registration.organization.id, userId: registration.user.id, category: 'registration_checkout', message: registrationReceiptMessage({ firstName: registration.user.firstName, organisationName: registration.organization.name, planName: plan.name, checkoutUrl: session.url }) });
      return res.status(201).json({ data: { checkoutUrl: session.url, registrationId: registration.organization.id } });
    } catch (stripeError) {
      await auditRegistration({ organizationId: registration.organization.id, userId: registration.user.id, action: 'stripe_checkout_creation_failed', req, metadata: { message: String(stripeError.message || stripeError).slice(0, 300) } });
      await sequelize.transaction(async (transaction) => {
        await Subscription.destroy({ where: { organizationId: registration.organization.id }, force: true, transaction });
        await BillingProfile.destroy({ where: { organizationId: registration.organization.id }, force: true, transaction });
        await User.destroy({ where: { id: registration.user.id }, force: true, transaction });
        await Organization.destroy({ where: { id: registration.organization.id }, force: true, transaction });
      });
      return next(stripeError);
    }
  } catch (error) { return next(error); }
}

export async function requestPasswordReset(req, res, next) {
  try {
    const { value, error } = resetRequestSchema.validate(req.body, { stripUnknown: true });
    if (error || value?.honeypot) return res.status(202).json({ data: { received: true } });
    const resetDelivery = await sequelize.transaction(async (transaction) => {
      await consumeAltchaPayload({ encodedPayload: value.altcha, purpose: 'password_reset', transaction });
      const user = await User.findOne({ where: { email: value.email, status: 'active' }, transaction });
      if (!user) return null;
      await PasswordResetToken.destroy({ where: { userId: user.id, consumedAt: null }, force: true, transaction });
      const token = createSecureToken();
      await PasswordResetToken.create({ userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000), requestedIpHash: fingerprint(req, req.ip) }, { transaction });
      await auditRegistration({ organizationId: user.organizationId, userId: user.id, action: 'password_reset_requested', req });
      return { email: user.email, organizationId: user.organizationId, userId: user.id, message: passwordResetMessage({ firstName: user.firstName, resetUrl: `${appUrl('/reset-password')}?token=${encodeURIComponent(token)}` }) };
    });
    if (resetDelivery) await sendTransactionalEmail({ to: resetDelivery.email, organizationId: resetDelivery.organizationId, userId: resetDelivery.userId, category: 'password_reset', message: resetDelivery.message });
    return res.status(202).json({ data: { received: true } });
  } catch (error) { return next(error); }
}

export async function resetPassword(req, res, next) {
  try {
    const { value, error } = resetConfirmSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const token = await PasswordResetToken.findOne({ where: { tokenHash: hashToken(value.token), consumedAt: null, expiresAt: { [Op.gt]: new Date() } }, include: [{ model: User }] });
    if (!token?.User || token.User.status !== 'active') return res.status(422).json({ error: 'That password reset link is invalid or has expired. Request a new reset link.' });
    await sequelize.transaction(async (transaction) => {
      await token.User.update({ passwordHash: await bcrypt.hash(value.password, 12), sessionVersion: token.User.sessionVersion + 1 }, { transaction });
      await token.update({ consumedAt: new Date() }, { transaction });
      await PasswordResetToken.update({ consumedAt: new Date() }, { where: { userId: token.User.id, consumedAt: null }, transaction });
      await auditRegistration({ organizationId: token.User.organizationId, userId: token.User.id, action: 'password_reset_completed', req });
    });
    return res.json({ data: { reset: true } });
  } catch (error) { return next(error); }
}

export { accountActivatedMessage };
