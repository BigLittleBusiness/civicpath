import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createHealthRouter } from './health.js';
import { healthService, activeRecordsMiddleware } from '../../backendRuntime.js';
import { recordMaintenanceRouter, recordMaintenanceCompatibilityRouter, recordMaintenanceProjectCompatibilityRouter } from './recordMaintenance.js';
import { reportSnapshotsRouter } from './reportSnapshots.js';
import { fundingLifecycleRouter } from './fundingLifecycle.js';
import { reviewWorkflowRouter } from './reviewWorkflow.js';
import { tenantLifecycleRouter } from './tenantLifecycleRouter.js';
import { createNotificationRouter } from './notifications.js';
import { authRouter } from './auth.js';
import { requireActiveEntitlement, requireAuth, tenantScope, requireRoles } from '../../middleware/auth.js';
import { overview } from '../../controllers/dashboardController.js';
import { listProjects, createProject } from '../../controllers/projectController.js';
import { listPriorities, createPriority, listWorkItems, createWorkItem, assessReadiness, listEvidence, createEvidence } from '../../controllers/portfolioController.js';
import { createConstraint, getProjectCouncilProof, listCouncilProofSelectors, listProjectConstraints, replaceProjectSelections, updateConstraint } from '../../controllers/councilProofController.js';
import { resetDemo } from '../../controllers/demoController.js';
import { previewImport, commitImport } from '../../controllers/importController.js';
import { adminRouter } from './admin.js';
import { submitPortfolioReadinessPulse } from '../../controllers/publicPulseController.js';
import { getPublicContactChallenge, submitPublicContactEnquiry } from '../../controllers/publicContactController.js';
import { publicPlans } from '../../controllers/accountLifecycleController.js';
import { councilSubscriptionSummary, createCustomerPortal, startCouncilProofConversionCheckout } from '../../controllers/stripeBillingController.js';
import { getSupportContactChallenge } from '../../controllers/supportContactController.js';
import { submitSupportContactWithAttachments, uploadSupportAttachments } from '../../controllers/supportAttachmentController.js';
import { disableWorkspaceMember, getWorkspaceMemberOwnership, inviteWorkspaceMember, listWorkspaceMembers, resendWorkspaceInvitation, updateWorkspaceMemberRole } from '../../controllers/peopleAccessController.js';
import { getWorkspaceProfile, updateWorkspaceProfile } from '../../controllers/workspaceController.js';
import {
  addActionParticipant,
  createActionRequest,
  createActionThread,
  createDecisionPack,
  createDependencyHandover,
  createEngagementPlan,
  createFundingCheckpoint,
  createFundingRoom,
  createPartnerCommitment,
  createReviewPack,
  createReviewPackOutcome,
  createReviewPackQuestion,
  createThreadComment,
  createWatch,
  getActionCollaboration,
  getDecisionPack,
  getMyCollaborationWork,
  getReviewPack,
  listReviewPacks,
  markNotificationRead,
  removeWatch,
  respondDependencyHandover,
  updateCollaborationRequest,
  updateQuarterlyWorkflow,
} from '../../controllers/collaborationController.js';
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
  createReportingPeriod,
  createRiskIssue,
  createStakeholder,
  createStrategy,
  createStrategyAction,
  getStrategyAction,
  linkActionProject,
  listAlerts,
  listStrategyWorkspace,
  previewStrategyImport,
  unlinkActionProject,
  updateAlert,
  updateDependency,
  updateReportingPeriod,
  updateStrategy,
} from '../../controllers/strategyController.js';

export const v1Router = Router();
v1Router.use('/health', createHealthRouter({ service: healthService, middleware: [rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false })] }));
v1Router.use('/auth', authRouter);
v1Router.get('/public/contact-challenge', getPublicContactChallenge);
v1Router.post('/public/contact-enquiries', submitPublicContactEnquiry);
v1Router.post('/public/portfolio-readiness-pulse', submitPortfolioReadinessPulse);
v1Router.get('/public/plans', publicPlans);
v1Router.use('/admin', requireAuth, tenantScope, adminRouter);
v1Router.use(requireAuth, tenantScope);
v1Router.get('/support/contact-challenge', getSupportContactChallenge);
v1Router.post('/support/contact-enquiries', uploadSupportAttachments, submitSupportContactWithAttachments);
v1Router.get('/billing/subscription', councilSubscriptionSummary);
v1Router.post('/billing/customer-portal', requireRoles('org_admin'), createCustomerPortal);
v1Router.post('/billing/council-proof-conversion-checkout', requireRoles('org_admin'), startCouncilProofConversionCheckout);
// Recovery is authenticated and unsuspended, but intentionally independent of entitlement.
v1Router.use('/tenant-lifecycle', tenantLifecycleRouter);
v1Router.use(requireActiveEntitlement);
// Standalone guarded routers must precede every legacy writer and active-view filter.
v1Router.use('/maintenance', recordMaintenanceRouter);
v1Router.use(recordMaintenanceCompatibilityRouter);
v1Router.use(recordMaintenanceProjectCompatibilityRouter);
v1Router.use(reportSnapshotsRouter);
v1Router.use(fundingLifecycleRouter);
v1Router.use('/notifications', createNotificationRouter());
v1Router.use(reviewWorkflowRouter);
v1Router.use(activeRecordsMiddleware);
v1Router.get('/workspace/profile', getWorkspaceProfile);
v1Router.patch('/workspace/profile', requireRoles('org_admin'), updateWorkspaceProfile);
v1Router.get('/workspace/members', requireRoles('org_admin'), listWorkspaceMembers);
v1Router.post('/workspace/members', requireRoles('org_admin'), inviteWorkspaceMember);
v1Router.patch('/workspace/members/:userId/role', requireRoles('org_admin'), updateWorkspaceMemberRole);
v1Router.get('/workspace/members/:userId/ownership', requireRoles('org_admin'), getWorkspaceMemberOwnership);
v1Router.delete('/workspace/members/:userId', requireRoles('org_admin'), disableWorkspaceMember);
v1Router.post('/workspace/members/:userId/resend-invitation', requireRoles('org_admin'), resendWorkspaceInvitation);
v1Router.get('/dashboard/overview', overview);
v1Router.get('/council-proof/selectors', listCouncilProofSelectors);
v1Router.get('/priorities', listPriorities);
v1Router.post('/priorities', requireRoles('org_admin', 'portfolio_manager'), createPriority);
v1Router.get('/projects', listProjects);
v1Router.post('/projects', requireRoles('org_admin', 'portfolio_manager'), createProject);
v1Router.get('/projects/:projectId/council-proof', getProjectCouncilProof);
v1Router.put('/projects/:projectId/selectors/:selectorCode', requireRoles('org_admin', 'portfolio_manager'), replaceProjectSelections);
v1Router.get('/projects/:projectId/constraints', listProjectConstraints);
v1Router.post('/projects/:projectId/constraints', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createConstraint);
v1Router.patch('/projects/:projectId/constraints/:constraintId', requireRoles('org_admin', 'portfolio_manager', 'contributor'), updateConstraint);
v1Router.post('/projects/:projectId/readiness-assessments', requireRoles('org_admin', 'portfolio_manager'), assessReadiness);
v1Router.get('/work-items', listWorkItems);
v1Router.post('/work-items', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createWorkItem);
v1Router.get('/evidence', listEvidence);
v1Router.post('/evidence', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createEvidence);
v1Router.post('/imports/preview', requireRoles('org_admin', 'portfolio_manager'), previewImport);
v1Router.post('/imports/commit', requireRoles('org_admin', 'portfolio_manager'), commitImport);
v1Router.get('/collaboration/my-work', getMyCollaborationWork);
v1Router.post('/collaboration/watches', createWatch);
v1Router.delete('/collaboration/watches/:watchId', removeWatch);
v1Router.patch('/collaboration/notifications/:notificationId/read', markNotificationRead);
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
v1Router.get('/strategy-actions/:actionId/collaboration', getActionCollaboration);
v1Router.post('/strategy-actions/:actionId/participants', requireRoles('org_admin', 'portfolio_manager', 'contributor'), addActionParticipant);
v1Router.post('/strategy-actions/:actionId/threads', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createActionThread);
v1Router.post('/strategy-actions/:actionId/requests', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createActionRequest);
v1Router.post('/strategy-actions/:actionId/partner-commitments', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createPartnerCommitment);
v1Router.post('/strategy-actions/:actionId/funding-rooms', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createFundingRoom);
v1Router.post('/strategy-actions/:actionId/engagement-plans', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createEngagementPlan);
v1Router.post('/strategy-actions/:actionId/projects', requireRoles('org_admin', 'portfolio_manager', 'contributor'), linkActionProject);
v1Router.delete('/strategy-actions/:actionId/projects/:projectId', requireRoles('org_admin', 'portfolio_manager', 'contributor'), unlinkActionProject);
v1Router.post('/strategy-actions/:actionId/milestones', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createMilestone);
v1Router.post('/strategy-actions/:actionId/measures', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createMeasure);
v1Router.post('/strategy-actions/:actionId/stakeholders', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createStakeholder);
v1Router.post('/strategy-actions/:actionId/funding-positions', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createFundingPosition);
v1Router.post('/strategy-actions/:actionId/evidence-links', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createEvidenceLink);
v1Router.patch('/strategy-reporting-periods/:periodId', requireRoles('org_admin', 'portfolio_manager'), updateReportingPeriod);
v1Router.post('/strategy-reporting-periods/:periodId/action-updates', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createQuarterlyUpdate);
v1Router.post('/collaboration/threads/:threadId/comments', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createThreadComment);
v1Router.patch('/collaboration/requests/:requestId', updateCollaborationRequest);
v1Router.post('/strategy-dependencies/:dependencyId/handover', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createDependencyHandover);
v1Router.patch('/strategy-dependencies/:dependencyId/handover', respondDependencyHandover);
v1Router.patch('/quarterly-action-updates/:updateId/workflow', updateQuarterlyWorkflow);
v1Router.post('/funding-collaboration-rooms/:roomId/checkpoints', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createFundingCheckpoint);
v1Router.post('/decision-packs', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createDecisionPack);
v1Router.get('/decision-packs/:packId', getDecisionPack);
v1Router.post('/review-packs', requireRoles('org_admin', 'portfolio_manager'), createReviewPack);
v1Router.get('/review-packs', listReviewPacks);
v1Router.get('/review-packs/:reviewPackId', getReviewPack);
v1Router.post('/review-packs/:reviewPackId/questions', requireRoles('org_admin', 'portfolio_manager', 'contributor'), createReviewPackQuestion);
v1Router.post('/review-packs/:reviewPackId/outcomes', requireRoles('org_admin', 'portfolio_manager'), createReviewPackOutcome);
v1Router.patch('/strategy-alerts/:alertId', requireRoles('org_admin', 'portfolio_manager'), updateAlert);
v1Router.post('/demo/reset', requireRoles('org_admin'), resetDemo);
