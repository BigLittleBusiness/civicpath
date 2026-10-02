import { Router } from 'express';
import { authRouter } from './auth.js';
import { requireActiveEntitlement, requireAuth, tenantScope, requireRoles } from '../../middleware/auth.js';
import { overview } from '../../controllers/dashboardController.js';
import { listProjects, createProject, updateProject } from '../../controllers/projectController.js';
import { listGrants, createGrant } from '../../controllers/grantController.js';
import { listPriorities, createPriority, listPathways, createPathway, listWorkItems, createWorkItem, assessReadiness, listEvidence, createEvidence } from '../../controllers/portfolioController.js';
import { createConstraint, getProjectCouncilProof, listCouncilProofSelectors, listProjectConstraints, replaceProjectSelections, updateConstraint } from '../../controllers/councilProofController.js';
import { resetDemo } from '../../controllers/demoController.js';
import { previewImport, commitImport } from '../../controllers/importController.js';
import { adminRouter } from './admin.js';
import { submitPortfolioReadinessPulse } from '../../controllers/publicPulseController.js';
import { getPublicContactChallenge, submitPublicContactEnquiry } from '../../controllers/publicContactController.js';
import { publicPlans } from '../../controllers/accountLifecycleController.js';
import { createCustomerPortal, startCouncilProofConversionCheckout } from '../../controllers/stripeBillingController.js';
import { getSupportContactChallenge } from '../../controllers/supportContactController.js';
import { submitSupportContactWithAttachments, uploadSupportAttachments } from '../../controllers/supportAttachmentController.js';
import {
  commitStrategyImport,
  createDecision,
  createDependency,
  createEvidenceLink,
  createFocusArea,
  createFundingPosition,
  createMeasure,
  createMilestone,
  createQuarterlyUpdate,
  createReportSnapshot,
  createReportingPeriod,
  createRiskIssue,
  createStakeholder,
  createStrategy,
  createStrategyAction,
  getQuarterlyReport,
  getStrategyAction,
  linkActionProject,
  listAlerts,
  listStrategyWorkspace,
  previewStrategyImport,
  unlinkActionProject,
  updateAlert,
  updateDependency,
  updateMilestone,
  updateReportingPeriod,
  updateStrategy,
  updateStrategyAction,
} from '../../controllers/strategyController.js';

export const v1Router = Router();
v1Router.get('/health', (_req, res) => res.json({ data: { service: 'civicpath-api', status: 'healthy' } }));
v1Router.use('/auth', authRouter);
v1Router.get('/public/contact-challenge', getPublicContactChallenge);
v1Router.post('/public/contact-enquiries', submitPublicContactEnquiry);
v1Router.post('/public/portfolio-readiness-pulse', submitPortfolioReadinessPulse);
v1Router.get('/public/plans', publicPlans);
v1Router.use('/admin', requireAuth, tenantScope, adminRouter);
v1Router.use(requireAuth, tenantScope);
v1Router.get('/support/contact-challenge', getSupportContactChallenge);
v1Router.post('/support/contact-enquiries', uploadSupportAttachments, submitSupportContactWithAttachments);
v1Router.post('/billing/customer-portal', requireRoles('org_admin'), createCustomerPortal);
v1Router.post('/billing/council-proof-conversion-checkout', requireRoles('org_admin'), startCouncilProofConversionCheckout);
v1Router.use(requireActiveEntitlement);
v1Router.get('/dashboard/overview', overview);
v1Router.get('/council-proof/selectors', listCouncilProofSelectors);
v1Router.get('/priorities', listPriorities);
v1Router.post('/priorities', requireRoles('org_admin', 'portfolio_manager'), createPriority);
v1Router.get('/projects', listProjects);
v1Router.post('/projects', requireRoles('org_admin', 'portfolio_manager'), createProject);
v1Router.patch('/projects/:projectId', requireRoles('org_admin', 'portfolio_manager'), updateProject);
v1Router.get('/projects/:projectId/council-proof', getProjectCouncilProof);
v1Router.put('/projects/:projectId/selectors/:selectorCode', requireRoles('org_admin', 'portfolio_manager'), replaceProjectSelections);
v1Router.get('/projects/:projectId/constraints', listProjectConstraints);
v1Router.post('/projects/:projectId/constraints', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createConstraint);
v1Router.patch('/projects/:projectId/constraints/:constraintId', requireRoles('org_admin', 'portfolio_manager', 'contributor'), updateConstraint);
v1Router.post('/projects/:projectId/readiness-assessments', requireRoles('org_admin', 'portfolio_manager'), assessReadiness);
v1Router.get('/funding-pathways', listPathways);
v1Router.post('/funding-pathways', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createPathway);
v1Router.get('/grants', listGrants);
v1Router.post('/grants', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createGrant);
v1Router.get('/work-items', listWorkItems);
v1Router.post('/work-items', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createWorkItem);
v1Router.get('/evidence', listEvidence);
v1Router.post('/evidence', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createEvidence);
v1Router.post('/imports/preview', requireRoles('org_admin', 'portfolio_manager'), previewImport);
v1Router.post('/imports/commit', requireRoles('org_admin', 'portfolio_manager'), commitImport);
v1Router.get('/strategy-workspace', listStrategyWorkspace);
v1Router.post('/strategies', requireRoles('org_admin', 'portfolio_manager'), createStrategy);
v1Router.patch('/strategies/:strategyId', requireRoles('org_admin', 'portfolio_manager'), updateStrategy);
v1Router.post('/strategies/:strategyId/focus-areas', requireRoles('org_admin', 'portfolio_manager'), createFocusArea);
v1Router.post('/strategies/:strategyId/actions', requireRoles('org_admin', 'portfolio_manager'), createStrategyAction);
v1Router.post('/strategies/:strategyId/dependencies', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createDependency);
v1Router.patch('/strategy-dependencies/:dependencyId', requireRoles('org_admin', 'portfolio_manager', 'contributor'), updateDependency);
v1Router.post('/strategies/:strategyId/reporting-periods', requireRoles('org_admin', 'portfolio_manager'), createReportingPeriod);
v1Router.get('/strategies/:strategyId/alerts', listAlerts);
v1Router.post('/strategies/:strategyId/decisions', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createDecision);
v1Router.post('/strategies/:strategyId/risks-issues', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createRiskIssue);
v1Router.post('/strategies/:strategyId/imports/actions/preview', requireRoles('org_admin', 'portfolio_manager'), previewStrategyImport);
v1Router.post('/strategies/:strategyId/imports/actions/commit', requireRoles('org_admin', 'portfolio_manager'), commitStrategyImport);
v1Router.get('/strategy-actions/:actionId', getStrategyAction);
v1Router.patch('/strategy-actions/:actionId', requireRoles('org_admin', 'portfolio_manager', 'contributor'), updateStrategyAction);
v1Router.post('/strategy-actions/:actionId/projects', requireRoles('org_admin', 'portfolio_manager', 'contributor'), linkActionProject);
v1Router.delete('/strategy-actions/:actionId/projects/:projectId', requireRoles('org_admin', 'portfolio_manager', 'contributor'), unlinkActionProject);
v1Router.post('/strategy-actions/:actionId/milestones', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createMilestone);
v1Router.patch('/strategy-milestones/:milestoneId', requireRoles('org_admin', 'portfolio_manager', 'contributor'), updateMilestone);
v1Router.post('/strategy-actions/:actionId/measures', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createMeasure);
v1Router.post('/strategy-actions/:actionId/stakeholders', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createStakeholder);
v1Router.post('/strategy-actions/:actionId/funding-positions', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createFundingPosition);
v1Router.post('/strategy-actions/:actionId/evidence-links', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createEvidenceLink);
v1Router.patch('/strategy-reporting-periods/:periodId', requireRoles('org_admin', 'portfolio_manager'), updateReportingPeriod);
v1Router.post('/strategy-reporting-periods/:periodId/action-updates', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createQuarterlyUpdate);
v1Router.get('/strategy-reporting-periods/:periodId/report', getQuarterlyReport);
v1Router.post('/strategy-reporting-periods/:periodId/report-snapshots', requireRoles('org_admin', 'portfolio_manager'), createReportSnapshot);
v1Router.patch('/strategy-alerts/:alertId', requireRoles('org_admin', 'portfolio_manager'), updateAlert);
v1Router.post('/demo/reset', requireRoles('org_admin'), resetDemo);
