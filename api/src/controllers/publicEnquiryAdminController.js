import Joi from 'joi';
import { Op, col, fn } from 'sequelize';
import { AuditLog, PublicContactEnquiry, User } from '../models/index.js';

const enquiryTypes = ['sales', 'council_proof', 'general'];
const followUpStatuses = ['new', 'contacted', 'follow_up_due', 'nurture', 'closed', 'not_a_fit'];

function platformAudit(req, action, metadata = {}) {
  return AuditLog.create({ organizationId: req.auth.organizationId, userId: req.auth.sub, entityType: 'public_contact_enquiry', action, metadata, ipAddress: req.ip }).catch(() => null);
}

const listSchema = Joi.object({
  category: Joi.string().valid('all', ...enquiryTypes).default('all'),
  status: Joi.string().valid('all', ...followUpStatuses).default('all'),
  search: Joi.string().trim().max(160).allow('').default(''),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

const followUpSchema = Joi.object({
  followUpStatus: Joi.string().valid(...followUpStatuses).required(),
  followUpDueAt: Joi.date().iso().allow(null, '').default(null),
  followUpNote: Joi.string().trim().max(3_000).allow('').default(''),
});

function publicEnquiryView(record) {
  return {
    id: record.id,
    firstName: record.firstName,
    lastName: record.lastName,
    email: record.email,
    councilName: record.councilName,
    role: record.role,
    enquiryType: record.enquiryType,
    message: record.message,
    createdAt: record.createdAt,
    sourceUrl: record.sourceUrl,
    notificationStatus: record.notificationStatus,
    notificationDeliveredAt: record.notificationDeliveredAt,
    followUpStatus: record.followUpStatus,
    followUpDueAt: record.followUpDueAt,
    followUpNote: record.followUpNote,
    followUpUpdatedAt: record.followUpUpdatedAt,
    followUpOwner: record.followUpOwner ? { id: record.followUpOwner.id, name: `${record.followUpOwner.firstName} ${record.followUpOwner.lastName}`.trim() } : null,
  };
}

export async function listPublicEnquiries(req, res, next) {
  try {
    const { value, error } = listSchema.validate(req.query, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(422).json({ error: 'Please review the enquiry filter values.', details: error.details.map((item) => item.message) });
    const where = {};
    if (value.category !== 'all') where.enquiryType = value.category;
    if (value.status !== 'all') where.followUpStatus = value.status;
    if (value.search) {
      const term = `%${value.search.replace(/[\\%_]/g, '\\$&')}%`;
      where[Op.or] = [
        { firstName: { [Op.like]: term } },
        { lastName: { [Op.like]: term } },
        { email: { [Op.like]: term } },
        { councilName: { [Op.like]: term } },
        { role: { [Op.like]: term } },
      ];
    }
    const records = await PublicContactEnquiry.findAll({
      where,
      include: [{ model: User, as: 'followUpOwner', attributes: ['id', 'firstName', 'lastName'] }],
      order: [['followUpStatus', 'ASC'], ['followUpDueAt', 'ASC'], ['createdAt', 'DESC']],
      limit: value.limit,
    });
    const statusCounts = await PublicContactEnquiry.findAll({ attributes: ['followUpStatus', [fn('COUNT', col('id')), 'count']], group: ['follow_up_status'], raw: true });
    return res.json({ data: { enquiries: records.map(publicEnquiryView), statusCounts: Object.fromEntries(statusCounts.map((item) => [item.followUpStatus, Number(item.count)])), filters: value } });
  } catch (error) { return next(error); }
}

export async function updatePublicEnquiryFollowUp(req, res, next) {
  try {
    const { value, error } = followUpSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(422).json({ error: 'Please review the follow-up details.', details: error.details.map((item) => item.message) });
    const record = await PublicContactEnquiry.findByPk(req.params.enquiryId);
    if (!record) return res.status(404).json({ error: 'Public enquiry not found.' });
    const resolvedAt = ['closed', 'not_a_fit'].includes(value.followUpStatus) ? new Date() : null;
    await record.update({
      followUpStatus: value.followUpStatus,
      followUpDueAt: value.followUpDueAt || null,
      followUpNote: value.followUpNote || null,
      followUpOwnerId: req.auth.sub,
      followUpUpdatedAt: new Date(),
      followUpResolvedAt: resolvedAt,
    });
    await platformAudit(req, 'public_enquiry_follow_up_updated', { enquiryId: record.id, enquiryType: record.enquiryType, followUpStatus: record.followUpStatus, hasDueDate: Boolean(record.followUpDueAt), hasNote: Boolean(record.followUpNote) });
    const refreshed = await PublicContactEnquiry.findByPk(record.id, { include: [{ model: User, as: 'followUpOwner', attributes: ['id', 'firstName', 'lastName'] }] });
    return res.json({ data: publicEnquiryView(refreshed) });
  } catch (error) { return next(error); }
}
