import Joi from 'joi';
import { Organization, User, Subscription, ProductPlan, SupportCase, AuditLog, CustomerContact, CustomerNote, TenantStateEvent } from '../models/index.js';
import { env } from '../config/env.js';

const stateSchema = Joi.object({ status: Joi.string().valid('trial', 'active', 'suspended').required(), reason: Joi.string().trim().min(8).max(1000).required() });
const contactSchema = Joi.object({ name: Joi.string().trim().max(160).required(), email: Joi.string().email().required(), title: Joi.string().trim().max(160).allow('', null), contactType: Joi.string().valid('primary', 'billing', 'technical', 'executive', 'other').default('primary'), isAuthorised: Joi.boolean().default(true) });
const noteSchema = Joi.object({ body: Joi.string().trim().min(2).max(5000).required(), visibility: Joi.string().valid('internal', 'handover').default('internal') });

async function councilCustomer(customerId) {
  const organisationTypes = env.demoMode ? ['council', 'joint_organisation', 'demo'] : ['council', 'joint_organisation'];
  return Organization.findOne({ where: { id: customerId, organisationType: organisationTypes } });
}

export async function customer360(req, res, next) {
  try {
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
  } catch (error) { return next(error); }
}

export async function changeTenantState(req, res, next) {
  try {
    const { value, error } = stateSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const customer = await councilCustomer(req.params.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer organisation not found.' });
    if (customer.isDemo) return res.status(422).json({ error: 'Demonstration tenants cannot have their state changed.' });
    if (customer.status === value.status) return res.status(422).json({ error: 'The tenant is already in that state.' });
    const fromStatus = customer.status;
    await customer.update({ status: value.status });
    await TenantStateEvent.create({ organizationId: customer.id, fromStatus, toStatus: value.status, reason: value.reason, actorId: req.auth.sub });
    await AuditLog.create({ organizationId: req.auth.organizationId, userId: req.auth.sub, entityType: 'customer_tenant', entityId: customer.id, action: 'tenant_state_changed', metadata: { customerName: customer.name, fromStatus, toStatus: value.status, reason: value.reason }, ipAddress: req.ip });
    return res.json({ data: { id: customer.id, status: customer.status } });
  } catch (error) { return next(error); }
}

export async function addCustomerContact(req, res, next) {
  try {
    const { value, error } = contactSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const customer = await councilCustomer(req.params.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer organisation not found.' });
    const contact = await CustomerContact.create({ organizationId: customer.id, ...value, createdBy: req.auth.sub });
    await AuditLog.create({ organizationId: req.auth.organizationId, userId: req.auth.sub, entityType: 'customer_contact', entityId: contact.id, action: 'customer_contact_added', metadata: { customerId: customer.id, contactType: contact.contactType }, ipAddress: req.ip });
    return res.status(201).json({ data: contact });
  } catch (error) { return next(error); }
}

export async function addCustomerNote(req, res, next) {
  try {
    const { value, error } = noteSchema.validate(req.body, { stripUnknown: true });
    if (error) return res.status(422).json({ error: error.message });
    const customer = await councilCustomer(req.params.customerId);
    if (!customer) return res.status(404).json({ error: 'Customer organisation not found.' });
    const note = await CustomerNote.create({ organizationId: customer.id, body: value.body, visibility: value.visibility, authorId: req.auth.sub });
    await AuditLog.create({ organizationId: req.auth.organizationId, userId: req.auth.sub, entityType: 'customer_note', entityId: note.id, action: 'customer_note_added', metadata: { customerId: customer.id, visibility: note.visibility }, ipAddress: req.ip });
    return res.status(201).json({ data: note });
  } catch (error) { return next(error); }
}
