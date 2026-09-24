import crypto from 'node:crypto';
import Joi from 'joi';
import { sequelize } from '../config/database.js';
import { PublicLead, PulseLeadConsent, PulseLeadNotification, PulseLeadResult, PulseLeadSession } from '../models/index.js';
import { calculatePulseResult, pulseResponseCodes } from '../services/pulseAssessment.js';
import { dispatchPulseNotifications } from '../services/pulseNotifications.js';
import { env } from '../config/env.js';
import { consumeAltchaPayload } from '../services/altchaProtection.js';

const roleCodes = ['economic_development', 'strategic_planning', 'grants_funding', 'infrastructure_projects', 'executive_leadership', 'community_place', 'other'];
const decisionUseCaseCodes = ['executive_briefing', 'planning_alignment', 'funding_pipeline', 'cross_team_coordination', 'portfolio_prioritisation', 'delivery_follow_through', 'other'];

const text = (max) => Joi.string().trim().max(max).allow('', null);
const publicUrl = Joi.string().trim().uri({ scheme: ['http', 'https'] }).max(1000).allow('', null);
const controlled = (codes) => Joi.string().valid(...codes).required();

const pulseSchema = Joi.object({
  sessionId: Joi.string().uuid().required(),
  firstName: Joi.string().trim().min(1).max(80).required(),
  lastName: Joi.string().trim().min(1).max(80).required(),
  email: Joi.string().trim().lowercase().email().max(191).required(),
  councilName: Joi.string().trim().min(2).max(180).required(),
  country: Joi.string().valid('AU', 'NZ').required(),
  stateRegion: Joi.string().trim().min(2).max(100).required(),
  role: controlled(roleCodes),
  roleOther: text(160),
  decisionUseCase: controlled(decisionUseCaseCodes),
  decisionUseCaseOther: text(320),
  portfolioFocus: Joi.array().items(Joi.string().valid(...pulseResponseCodes.portfolioFocus)).min(1).max(4).unique().required(),
  portfolioFocusOther: text(80),
  portfolioVisibilityLocation: controlled(pulseResponseCodes.portfolioVisibilityLocation),
  portfolioInformationConsistency: controlled(pulseResponseCodes.portfolioInformationConsistency),
  strategicConnection: controlled(pulseResponseCodes.strategicConnection),
  decisionComparison: controlled(pulseResponseCodes.decisionComparison),
  readinessOwnerNextAction: controlled(pulseResponseCodes.readinessOwnerNextAction),
  evidenceVisibility: controlled(pulseResponseCodes.evidenceVisibility),
  constraintActioning: controlled(pulseResponseCodes.constraintActioning),
  constraintThemes: Joi.array().items(Joi.string().valid(...pulseResponseCodes.constraintThemes)).min(1).max(5).unique().required(),
  constraintThemesOther: text(120),
  requestNote: text(320),
  resourceAcknowledged: Joi.boolean().valid(true).required(),
  marketingConsent: Joi.boolean().default(false),
  sourceUrl: publicUrl,
  referrer: publicUrl,
  altcha: Joi.string().trim().min(1).max(16_000).required(),
  honeypot: Joi.string().allow('').max(0).default(''),
}).custom((value, helpers) => {
  if (value.role === 'other' && !value.roleOther) return helpers.error('any.custom', { message: 'Please describe your role.' });
  if (value.decisionUseCase === 'other' && !value.decisionUseCaseOther) return helpers.error('any.custom', { message: 'Please describe what you would like to make easier.' });
  if (value.portfolioFocus.includes('other') && !value.portfolioFocusOther) return helpers.error('any.custom', { message: 'Please describe the additional portfolio focus.' });
  if (value.constraintThemes.includes('other') && !value.constraintThemesOther) return helpers.error('any.custom', { message: 'Please describe the additional constraint.' });
  return value;
}, 'Pulse context validation');

const resourceWording = 'By requesting my snapshot, I understand CivicPath will use the details above to send this requested resource and manage this enquiry in accordance with the Privacy Notice.';
const marketingWording = 'Yes, send me occasional practical CivicPath updates for Australian and New Zealand council teams. I can unsubscribe at any time.';

function fingerprint(req, value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(`${env.jwtSecret}:portfolio-readiness-pulse:${value}`).digest('hex');
}

function cleanResponses(value) {
  return {
    portfolioFocus: value.portfolioFocus,
    portfolioFocusOther: value.portfolioFocusOther || null,
    portfolioVisibilityLocation: value.portfolioVisibilityLocation,
    portfolioInformationConsistency: value.portfolioInformationConsistency,
    strategicConnection: value.strategicConnection,
    decisionComparison: value.decisionComparison,
    readinessOwnerNextAction: value.readinessOwnerNextAction,
    evidenceVisibility: value.evidenceVisibility,
    constraintActioning: value.constraintActioning,
    constraintThemes: value.constraintThemes,
    constraintThemesOther: value.constraintThemesOther || null,
    requestNote: value.requestNote || null,
  };
}

function publicResult(result) {
  return {
    overallScore: result.overallScore,
    bandCode: result.bandCode,
    bandLabel: result.bandLabel,
    summary: result.summary,
    dimensions: [
      { key: 'portfolioVisibility', label: 'Portfolio visibility', score: result.portfolioVisibilityScore, status: result.portfolioVisibilityScore < 50 ? 'Baseline to establish' : result.portfolioVisibilityScore < 75 ? 'Working view to connect' : 'Shared view in place' },
      { key: 'strategicConnection', label: 'Strategic connection', score: result.strategicConnectionScore, status: result.strategicConnectionScore < 50 ? 'Link to make visible' : result.strategicConnectionScore < 75 ? 'Alignment to strengthen' : 'Alignment visible' },
      { key: 'decisionReadiness', label: 'Decision readiness', score: result.decisionReadinessScore, status: result.decisionReadinessScore < 50 ? 'Next actions to clarify' : result.decisionReadinessScore < 75 ? 'Decision evidence to strengthen' : 'Decision pathway visible' },
    ],
    actions: result.actions,
  };
}

export async function submitPortfolioReadinessPulse(req, res, next) {
  try {
    const { value, error } = pulseSchema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) return res.status(422).json({ error: 'Please review the highlighted assessment fields.', details: error.details.map((item) => item.message) });
    if (value.honeypot) return res.status(422).json({ error: 'This assessment could not be submitted.' });
    const calculation = calculatePulseResult(value);
    const evidence = { ipHash: fingerprint(req, req.ip), userAgentHash: fingerprint(req, req.get('user-agent')), sourceUrl: value.sourceUrl || null, referrer: value.referrer || null, submittedAt: new Date().toISOString() };

    const submission = await sequelize.transaction(async (transaction) => {
      await consumeAltchaPayload({ encodedPayload: value.altcha, purpose: 'portfolio_readiness_pulse', transaction });
      const existing = await PublicLead.findOne({ where: { email: value.email, councilName: value.councilName }, transaction });
      const leadFields = {
        firstName: value.firstName,
        lastName: value.lastName,
        email: value.email,
        councilName: value.councilName,
        country: value.country,
        stateRegion: value.stateRegion,
        role: value.role,
        roleOther: value.roleOther || null,
        decisionUseCase: value.decisionUseCase,
        decisionUseCaseOther: value.decisionUseCaseOther || null,
        lastPulseAt: new Date(),
      };
      const lead = existing ? await existing.update(leadFields, { transaction }) : await PublicLead.create(leadFields, { transaction });
      const session = await PulseLeadSession.create({ sessionId: value.sessionId, leadId: lead.id, sourceUrl: value.sourceUrl || null, referrer: value.referrer || null, ipHash: evidence.ipHash, userAgentHash: evidence.userAgentHash, responses: cleanResponses(value) }, { transaction });
      await PulseLeadConsent.bulkCreate([
        { leadId: lead.id, sessionId: session.sessionId, consentType: 'resource_request', granted: true, wording: resourceWording, evidence },
        { leadId: lead.id, sessionId: session.sessionId, consentType: 'marketing_updates', granted: value.marketingConsent, wording: marketingWording, evidence },
      ], { transaction });
      const result = await PulseLeadResult.create({ leadId: lead.id, sessionId: session.sessionId, ...calculation }, { transaction });
      await PulseLeadNotification.bulkCreate([
        { leadId: lead.id, sessionId: session.sessionId, notificationType: 'recipient_email' },
        { leadId: lead.id, sessionId: session.sessionId, notificationType: 'internal_alert' },
        { leadId: lead.id, sessionId: session.sessionId, notificationType: 'crm_webhook' },
      ], { transaction });
      return { lead, session, result };
    });

    let notifications = [];
    try { notifications = await dispatchPulseNotifications(submission.session.sessionId); }
    catch (dispatchError) { console.error('[civicpath] pulse notification dispatch failed', dispatchError); }
    const recipientEmail = notifications.find((notification) => notification.notificationType === 'recipient_email');
    return res.status(201).json({ data: { result: publicResult(submission.result), emailDelivery: recipientEmail?.status || 'pending', email: value.email.replace(/(^.).*(@.*$)/, '$1••••$2') } });
  } catch (error) { return next(error); }
}

export const portfolioReadinessPulseMeta = Object.freeze({ resourceWording, marketingWording });
