import Joi from 'joi';
import { Organization, User, Subscription, ProductPlan, SupportCase, AuditLog, CustomerContact, CustomerNote, TenantStateEvent } from '../models/index.js';
import { env } from '../config/env.js';
import { sequelize } from '../config/database.js';
import { assertPlatformActor } from '../services/tenantAccessPolicy.js';
import { createTenantStateChanger, councilOrganisationTypes } from '../services/tenantStateChange.js';

const stateSchema = Joi.object({ status: Joi.string().valid('trial', 'active', 'suspended').required(), reason: Joi.string().trim().min(8).max(1000).required() });
const contactSchema = Joi.object({ name: Joi.string().trim().max(160).required(), email: Joi.string().email().required(), title: Joi.string().trim().max(160).allow('', null), contactType: Joi.string().valid('primary', 'billing', 'technical', 'executive', 'other').default('primary'), isAuthorised: Joi.boolean().default(true) });
const noteSchema = Joi.object({ body: Joi.string().trim().min(2).max(5000).required(), visibility: Joi.string().valid('internal', 'handover').default('internal') });

const changeState = createTenantStateChanger({ sequelize, Organization, User, TenantStateEvent, AuditLog, demoMode: env.demoMode, privilegedActionMinutes: env.privilegedActionMinutes });
function handleFailure(error, res, next) {
  if ([403, 404, 422, 428].includes(error.status)) return res.status(error.status).json({ error: error.message, ...(error.code ? { code: error.code } : {}) });
  return next(error);
}

async function councilCustomer(customerId) {
  const organisationTypes = councilOrganisationTypes(env.demoMode);
  return Organization.findOne({ where: { id: customerId, organisationType: organisationTypes } });
}

export async function customer360(req, res, next) {
  try {
    assertPlatformActor(req.auth);
    const customer = await councilCustomer(req.params.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer organisation not found.' });
    const [subscriptions, users, cases, contacts, notes, stateEvents, recentActivity] = await Promise.all([
      Subscription.findAll({ where: { organizationId: customer.id }, include: [{ model: ProductPlan }], order: [['createdAt', 'DESC']] }),
      User.findAll({ where: { organizationId: customer.id }, attributes: ['id', 'firstName', 'lastName', 'email', 'role', 'status', 'lastLoginAt', 'createdAt'], order: [['lastLoginAt', 'DESC']] }),
      SupportCase.findAll({ where: { organizationId: customer.id }, order: [['updatedAt', 'DESC']], limit: 20 }),
      CustomerContact.findAll({ where: { organizationId: customer.id }, order: [['isAuthorised', 'DESC'], ['name', 'ASC']] }),
      CustomerNote.findAll({ where: { organizationId: customer.id }, include: [{ model: User, as: 'author', attributes: ['firstName', 'lastName'] }], order: [['createdAt', 'DESC']], limit: 20 }),
      TenantStateEvent.findAll({ where: { organizationId: customer.id }, include: [{ model: User, as: 'actor', attributes: ['firstName', 'lastName'] }], order: [['createdAt', 'DESC']], limit: 20 }),
      AuditLog.findAll({ where: { organizationId: customer.id }, order: [['createdAt', 'DESC']], limit: 20 }),
    ]);
    return res.json({ data: { customer, subscriptions, users, cases, contacts, notes, stateEvents, recentActivity } });
  } catch (error) { return handleFailure(error, res, next); }
}

export async function changeTenantState(req, res, next) {
  try {
    assertPlatformActor(req.auth, { stepUp: true, privilegedActionMinutes: env.privilegedActionMinutes });
    const { value, error } = stateSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const data = await changeState({ actor: req.auth, customerId: req.params.customerId, ...value, ipAddress: req.ip });
    return res.json({ data });
  } catch (error) { return handleFailure(error, res, next); }
}

export async function addCustomerContact(req, res, next) {
  try {
    assertPlatformActor(req.auth);
    const { value, error } = contactSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const customer = await councilCustomer(req.params.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer organisation not found.' });
    const contact = await CustomerContact.create({ organizationId: customer.id, ...value, createdBy: req.auth.sub });
    await AuditLog.create({ organizationId: req.auth.organizationId, userId: req.auth.sub, entityType: 'customer_contact', entityId: contact.id, action: 'customer_contact_added', metadata: { customerId: customer.id, contactType: contact.contactType }, ipAddress: req.ip });
    return res.status(201).json({ data: contact });
  } catch (error) { return handleFailure(error, res, next); }
}

export async function addCustomerNote(req, res, next) {
  try {
    assertPlatformActor(req.auth);
    const { value, error } = noteSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const customer = await councilCustomer(req.params.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer organisation not found.' });
    const note = await CustomerNote.create({ organizationId: customer.id, body: value.body, visibility: value.visibility, authorId: req.auth.sub });
    await AuditLog.create({ organizationId: req.auth.organizationId, userId: req.auth.sub, entityType: 'customer_note', entityId: note.id, action: 'customer_note_added', metadata: { customerId: customer.id, visibility: note.visibility }, ipAddress: req.ip });
    return res.status(201).json({ data: note });
  } catch (error) { return handleFailure(error, res, next); }
}
