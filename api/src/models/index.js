import { DataTypes } from 'sequelize';
import { sequelize } from '../config/database.js';

const standard = { timestamps: true, underscored: true, paranoid: true };

export const Organization = sequelize.define('Organization', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  name: { type: DataTypes.STRING(160), allowNull: false },
  slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  country: { type: DataTypes.ENUM('AU', 'NZ'), allowNull: false, defaultValue: 'AU' },
  organisationType: { type: DataTypes.ENUM('council', 'joint_organisation', 'partner', 'demo', 'platform'), allowNull: false, defaultValue: 'council' },
  planCode: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'proof' },
  isDemo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  status: { type: DataTypes.ENUM('trial', 'active', 'suspended'), allowNull: false, defaultValue: 'trial' },
  defaultCurrency: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'AUD', validate: { isIn: [['AUD', 'NZD']] } },
}, standard);

export const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  email: { type: DataTypes.STRING(191), allowNull: false, validate: { isEmail: true } },
  firstName: { type: DataTypes.STRING(80), allowNull: false },
  lastName: { type: DataTypes.STRING(80), allowNull: false },
  passwordHash: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM('platform_admin', 'org_admin', 'portfolio_manager', 'contributor', 'executive'), allowNull: false, defaultValue: 'contributor' },
  status: { type: DataTypes.ENUM('invited', 'active', 'disabled'), allowNull: false, defaultValue: 'invited' },
  lastLoginAt: { type: DataTypes.DATE, allowNull: true },
  mfaRequired: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  mfaEnabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  mfaSecretEncrypted: { type: DataTypes.JSON, allowNull: true },
  mfaRecoveryCodes: { type: DataTypes.JSON, allowNull: true },
  mfaEnrolledAt: { type: DataTypes.DATE, allowNull: true },
  mfaLastVerifiedAt: { type: DataTypes.DATE, allowNull: true },
}, { ...standard, indexes: [{ unique: true, fields: ['organization_id', 'email'] }] });

export const ProductPlan = sequelize.define('ProductPlan', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  code: { type: DataTypes.STRING(60), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(120), allowNull: false },
  product: { type: DataTypes.ENUM('civicpath', 'grantmaestro', 'bundle'), allowNull: false },
  annualPriceAud: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  workflowUserLimit: { type: DataTypes.INTEGER, allowNull: true },
  activeProjectLimit: { type: DataTypes.INTEGER, allowNull: true },
  activeGrantLimit: { type: DataTypes.INTEGER, allowNull: true },
  features: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, standard);

export const Subscription = sequelize.define('Subscription', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  planId: { type: DataTypes.UUID, allowNull: false },
  status: { type: DataTypes.ENUM('trial', 'active', 'past_due', 'cancelled', 'expired'), allowNull: false, defaultValue: 'trial' },
  startsAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  endsAt: { type: DataTypes.DATE, allowNull: true },
  billingProvider: { type: DataTypes.STRING(40), allowNull: true },
  billingReference: { type: DataTypes.STRING(180), allowNull: true },
  entitlements: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
}, standard);

export const IntegrationConnection = sequelize.define('IntegrationConnection', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  provider: { type: DataTypes.ENUM('grantmaestro', 'technologyone', 'remplan', 'id_profile', 'custom'), allowNull: false },
  status: { type: DataTypes.ENUM('not_connected', 'pending', 'active', 'error', 'disabled'), allowNull: false, defaultValue: 'not_connected' },
  externalOrganizationReference: { type: DataTypes.STRING(180), allowNull: true },
  encryptedConfiguration: { type: DataTypes.TEXT, allowNull: true },
  lastSyncedAt: { type: DataTypes.DATE, allowNull: true },
}, { ...standard, indexes: [{ unique: true, fields: ['organization_id', 'provider'] }] });

export const PlatformSetting = sequelize.define('PlatformSetting', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  settingKey: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  configuration: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  encryptedPayload: { type: DataTypes.JSON, allowNull: true },
  updatedBy: { type: DataTypes.UUID, allowNull: true },
}, standard);

export const SupportCase = sequelize.define('SupportCase', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  requesterId: { type: DataTypes.UUID, allowNull: true },
  title: { type: DataTypes.STRING(240), allowNull: false },
  category: { type: DataTypes.ENUM('access', 'billing', 'data', 'grant_lifecycle', 'portfolio', 'technical', 'other'), allowNull: false, defaultValue: 'other' },
  priority: { type: DataTypes.ENUM('low', 'normal', 'high', 'urgent'), allowNull: false, defaultValue: 'normal' },
  status: { type: DataTypes.ENUM('new', 'in_progress', 'waiting_customer', 'resolved', 'closed'), allowNull: false, defaultValue: 'new' },
  summary: { type: DataTypes.TEXT, allowNull: true },
  ownerId: { type: DataTypes.UUID, allowNull: true },
  resolvedAt: { type: DataTypes.DATE, allowNull: true },
}, standard);

// Support attachments use a private object-store key only; no public URL is persisted.
export const SupportAttachment = sequelize.define('SupportAttachment', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  supportCaseId: { type: DataTypes.UUID, allowNull: false },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  uploadedBy: { type: DataTypes.UUID, allowNull: true },
  originalFilename: { type: DataTypes.STRING(180), allowNull: false },
  contentType: { type: DataTypes.STRING(160), allowNull: false },
  sizeBytes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
  checksumSha256: { type: DataTypes.STRING(64), allowNull: false },
  storageProvider: { type: DataTypes.ENUM('local', 's3'), allowNull: false },
  storageKey: { type: DataTypes.STRING(500), allowNull: false, unique: true },
}, { ...standard, indexes: [{ fields: ['support_case_id', 'created_at'] }, { fields: ['organization_id', 'created_at'] }] });

export const CustomerContact = sequelize.define('CustomerContact', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(160), allowNull: false },
  email: { type: DataTypes.STRING(191), allowNull: false, validate: { isEmail: true } },
  title: { type: DataTypes.STRING(160), allowNull: true },
  contactType: { type: DataTypes.ENUM('primary', 'billing', 'technical', 'executive', 'other'), allowNull: false, defaultValue: 'primary' },
  isAuthorised: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  createdBy: { type: DataTypes.UUID, allowNull: true },
}, standard);

export const CustomerNote = sequelize.define('CustomerNote', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  authorId: { type: DataTypes.UUID, allowNull: true },
  body: { type: DataTypes.TEXT, allowNull: false },
  visibility: { type: DataTypes.ENUM('internal', 'handover'), allowNull: false, defaultValue: 'internal' },
}, standard);

export const TenantStateEvent = sequelize.define('TenantStateEvent', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  fromStatus: { type: DataTypes.STRING(40), allowNull: false },
  toStatus: { type: DataTypes.STRING(40), allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: false },
  actorId: { type: DataTypes.UUID, allowNull: true },
}, standard);

export const SelectorOptionSet = sequelize.define('SelectorOptionSet', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: true },
  code: { type: DataTypes.STRING(100), allowNull: false },
  label: { type: DataTypes.STRING(160), allowNull: false },
  description: { type: DataTypes.STRING(500), allowNull: true },
  appliesTo: { type: DataTypes.ENUM('organization', 'project', 'readiness_assessment', 'funding_pathway', 'grant', 'work_item', 'evidence_item', 'project_constraint'), allowNull: false },
  selectionMode: { type: DataTypes.ENUM('single', 'multi'), allowNull: false, defaultValue: 'single' },
  maxSelections: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 50 } },
  allowsOther: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  scope: { type: DataTypes.ENUM('platform', 'tenant'), allowNull: false, defaultValue: 'platform' },
  status: { type: DataTypes.ENUM('active', 'deprecated', 'retired'), allowNull: false, defaultValue: 'active' },
  metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
}, { ...standard, indexes: [{ unique: true, fields: ['organization_id', 'code'] }, { fields: ['applies_to', 'status'] }] });

export const SelectorOption = sequelize.define('SelectorOption', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  optionSetId: { type: DataTypes.UUID, allowNull: false },
  organizationId: { type: DataTypes.UUID, allowNull: true },
  code: { type: DataTypes.STRING(100), allowNull: false },
  label: { type: DataTypes.STRING(160), allowNull: false },
  description: { type: DataTypes.STRING(500), allowNull: true },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  isOther: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  isCustom: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  status: { type: DataTypes.ENUM('active', 'deprecated', 'retired'), allowNull: false, defaultValue: 'active' },
  value: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
}, { ...standard, indexes: [{ unique: true, fields: ['option_set_id', 'organization_id', 'code'] }, { fields: ['option_set_id', 'status', 'sort_order'] }] });

export const OrganizationSelectorOptionOverride = sequelize.define('OrganizationSelectorOptionOverride', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  optionId: { type: DataTypes.UUID, allowNull: false },
  labelOverride: { type: DataTypes.STRING(160), allowNull: true },
  status: { type: DataTypes.ENUM('enabled', 'hidden'), allowNull: false, defaultValue: 'enabled' },
  sortOrderOverride: { type: DataTypes.INTEGER, allowNull: true },
  updatedBy: { type: DataTypes.UUID, allowNull: true },
}, { ...standard, indexes: [{ unique: true, fields: ['organization_id', 'option_id'] }] });

export const Priority = sequelize.define('Priority', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  title: { type: DataTypes.STRING(200), allowNull: false },
  planReference: { type: DataTypes.STRING(160), allowNull: true },
  outcomeArea: { type: DataTypes.STRING(100), allowNull: true },
  status: { type: DataTypes.ENUM('active', 'archived'), defaultValue: 'active' },
}, standard);

export const CivicProject = sequelize.define('CivicProject', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  priorityId: { type: DataTypes.UUID, allowNull: true },
  ownerId: { type: DataTypes.UUID, allowNull: true },
  name: { type: DataTypes.STRING(200), allowNull: false },
  summary: { type: DataTypes.TEXT, allowNull: true },
  category: { type: DataTypes.ENUM('economic_development', 'infrastructure', 'community', 'environment', 'strategic_planning', 'other'), defaultValue: 'other' },
  stage: { type: DataTypes.ENUM('concept', 'scoping', 'business_case', 'funding_ready', 'approved', 'delivery', 'completed', 'on_hold'), defaultValue: 'concept' },
  estimatedCost: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  targetFunding: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  securedFunding: { type: DataTypes.DECIMAL(14, 2), allowNull: false, defaultValue: 0 },
  currencyCode: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'AUD', validate: { isIn: [['AUD', 'NZD']] } },
  expectedJobs: { type: DataTypes.INTEGER, allowNull: true },
  expectedBenefit: { type: DataTypes.STRING(240), allowNull: true },
  targetDate: { type: DataTypes.DATEONLY, allowNull: true },
  isSample: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, standard);

export const ProjectPriority = sequelize.define('ProjectPriority', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  projectId: { type: DataTypes.UUID, allowNull: false },
  priorityId: { type: DataTypes.UUID, allowNull: false },
  isPrimary: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  assignedBy: { type: DataTypes.UUID, allowNull: true },
}, { ...standard, indexes: [{ unique: true, fields: ['project_id', 'priority_id'] }, { fields: ['organization_id', 'priority_id'] }] });

export const ProjectSelectorValue = sequelize.define('ProjectSelectorValue', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  projectId: { type: DataTypes.UUID, allowNull: false },
  optionSetId: { type: DataTypes.UUID, allowNull: false },
  optionId: { type: DataTypes.UUID, allowNull: false },
  otherValue: { type: DataTypes.STRING(500), allowNull: true },
  otherValueNormalized: { type: DataTypes.STRING(500), allowNull: true },
  selectedBy: { type: DataTypes.UUID, allowNull: true },
  metadata: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
}, { timestamps: true, underscored: true, paranoid: false, indexes: [{ unique: true, fields: ['project_id', 'option_set_id', 'option_id'] }, { fields: ['organization_id', 'project_id', 'option_set_id'] }] });

export const ProjectConstraint = sequelize.define('ProjectConstraint', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  projectId: { type: DataTypes.UUID, allowNull: false },
  constraintOptionId: { type: DataTypes.UUID, allowNull: false },
  constraintKey: { type: DataTypes.STRING(600), allowNull: false },
  otherValue: { type: DataTypes.STRING(500), allowNull: true },
  severityOptionId: { type: DataTypes.UUID, allowNull: false },
  statusOptionId: { type: DataTypes.UUID, allowNull: false },
  ownerId: { type: DataTypes.UUID, allowNull: true },
  dueDate: { type: DataTypes.DATEONLY, allowNull: true },
  detail: { type: DataTypes.TEXT, allowNull: true },
  resolutionNote: { type: DataTypes.TEXT, allowNull: true },
  resolvedAt: { type: DataTypes.DATE, allowNull: true },
  createdBy: { type: DataTypes.UUID, allowNull: true },
}, { ...standard, indexes: [{ unique: true, fields: ['project_id', 'constraint_key'] }, { fields: ['organization_id', 'project_id', 'severity_option_id'] }] });

export const ReadinessAssessment = sequelize.define('ReadinessAssessment', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  projectId: { type: DataTypes.UUID, allowNull: false },
  scopeScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 5 } },
  costScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 5 } },
  approvalsScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 5 } },
  partnerScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 5 } },
  fundingScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 5 } },
  deliveryScore: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 5 } },
  score: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0, max: 100 } },
  assessmentNote: { type: DataTypes.TEXT, allowNull: true },
  assessedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, standard);

export const FundingPathway = sequelize.define('FundingPathway', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  projectId: { type: DataTypes.UUID, allowNull: false },
  sourceName: { type: DataTypes.STRING(200), allowNull: false },
  sourceType: { type: DataTypes.ENUM('grant', 'loan', 'council', 'partner', 'private', 'other'), defaultValue: 'grant' },
  fit: { type: DataTypes.ENUM('strong', 'possible', 'watch'), defaultValue: 'possible' },
  potentialAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  currencyCode: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'AUD', validate: { isIn: [['AUD', 'NZD']] } },
  dueDate: { type: DataTypes.DATEONLY, allowNull: true },
  status: { type: DataTypes.ENUM('watching', 'preparing', 'submitted', 'awarded', 'not_successful', 'closed'), defaultValue: 'watching' },
  note: { type: DataTypes.TEXT, allowNull: true },
}, standard);

export const Grant = sequelize.define('Grant', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  projectId: { type: DataTypes.UUID, allowNull: true },
  fundingPathwayId: { type: DataTypes.UUID, allowNull: true },
  title: { type: DataTypes.STRING(200), allowNull: false },
  funder: { type: DataTypes.STRING(180), allowNull: false },
  requestedAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  awardedAmount: { type: DataTypes.DECIMAL(14, 2), allowNull: true },
  currencyCode: { type: DataTypes.CHAR(3), allowNull: false, defaultValue: 'AUD', validate: { isIn: [['AUD', 'NZD']] } },
  status: { type: DataTypes.ENUM('identified', 'assessing', 'preparing', 'submitted', 'awarded', 'contracted', 'acquitting', 'acquitted', 'not_successful', 'withdrawn'), defaultValue: 'identified' },
  dueDate: { type: DataTypes.DATEONLY, allowNull: true },
  acquittalDueDate: { type: DataTypes.DATEONLY, allowNull: true },
  leadId: { type: DataTypes.UUID, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  isSample: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, standard);

export const WorkItem = sequelize.define('WorkItem', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  projectId: { type: DataTypes.UUID, allowNull: true },
  grantId: { type: DataTypes.UUID, allowNull: true },
  ownerId: { type: DataTypes.UUID, allowNull: true },
  title: { type: DataTypes.STRING(240), allowNull: false },
  workType: { type: DataTypes.ENUM('action', 'grant_task', 'decision', 'risk'), allowNull: false, defaultValue: 'action' },
  status: { type: DataTypes.ENUM('not_started', 'in_progress', 'blocked', 'complete'), defaultValue: 'not_started' },
  priority: { type: DataTypes.ENUM('low', 'medium', 'high', 'critical'), defaultValue: 'medium' },
  dueDate: { type: DataTypes.DATEONLY, allowNull: true },
  detail: { type: DataTypes.TEXT, allowNull: true },
  impact: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
  likelihood: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 5 } },
}, standard);

export const EvidenceItem = sequelize.define('EvidenceItem', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  projectId: { type: DataTypes.UUID, allowNull: true },
  grantId: { type: DataTypes.UUID, allowNull: true },
  title: { type: DataTypes.STRING(240), allowNull: false },
  evidenceType: { type: DataTypes.ENUM('document', 'metric', 'decision_record', 'link', 'other'), defaultValue: 'document' },
  storageKey: { type: DataTypes.STRING(500), allowNull: true },
  externalUrl: { type: DataTypes.STRING(1000), allowNull: true, validate: { isUrl: true } },
  source: { type: DataTypes.STRING(240), allowNull: true },
  isVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
}, standard);

export const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  organizationId: { type: DataTypes.UUID, allowNull: false },
  userId: { type: DataTypes.UUID, allowNull: true },
  entityType: { type: DataTypes.STRING(80), allowNull: false },
  entityId: { type: DataTypes.UUID, allowNull: true },
  action: { type: DataTypes.STRING(80), allowNull: false },
  metadata: { type: DataTypes.JSON, allowNull: true },
  ipAddress: { type: DataTypes.STRING(64), allowNull: true },
}, { timestamps: true, updatedAt: false, underscored: true });

// Public prospect records are deliberately separate from council tenants and Council Proof data.
export const PublicLead = sequelize.define('PublicLead', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  firstName: { type: DataTypes.STRING(80), allowNull: false },
  lastName: { type: DataTypes.STRING(80), allowNull: false },
  email: { type: DataTypes.STRING(191), allowNull: false, validate: { isEmail: true } },
  councilName: { type: DataTypes.STRING(180), allowNull: false },
  country: { type: DataTypes.ENUM('AU', 'NZ'), allowNull: false },
  stateRegion: { type: DataTypes.STRING(100), allowNull: false },
  role: { type: DataTypes.STRING(80), allowNull: false },
  roleOther: { type: DataTypes.STRING(160), allowNull: true },
  decisionUseCase: { type: DataTypes.STRING(100), allowNull: false },
  decisionUseCaseOther: { type: DataTypes.STRING(320), allowNull: true },
  lifecycleStatus: { type: DataTypes.ENUM('new', 'contacted', 'exploring', 'nurture', 'closed', 'unsubscribed'), allowNull: false, defaultValue: 'new' },
  ownerId: { type: DataTypes.UUID, allowNull: true },
  source: { type: DataTypes.STRING(160), allowNull: false, defaultValue: 'portfolio_readiness_pulse' },
  lastPulseAt: { type: DataTypes.DATE, allowNull: true },
}, { ...standard, indexes: [{ fields: ['email', 'council_name'] }, { fields: ['lifecycle_status', 'created_at'] }] });

export const PulseLeadSession = sequelize.define('PulseLeadSession', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  sessionId: { type: DataTypes.UUID, allowNull: false, unique: true },
  leadId: { type: DataTypes.UUID, allowNull: false },
  assessmentVersion: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '1.0.0' },
  sourceUrl: { type: DataTypes.STRING(1000), allowNull: true },
  referrer: { type: DataTypes.STRING(1000), allowNull: true },
  ipHash: { type: DataTypes.STRING(128), allowNull: true },
  userAgentHash: { type: DataTypes.STRING(128), allowNull: true },
  responses: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  completedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
}, standard);

export const PulseLeadConsent = sequelize.define('PulseLeadConsent', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  leadId: { type: DataTypes.UUID, allowNull: false },
  sessionId: { type: DataTypes.UUID, allowNull: false },
  consentType: { type: DataTypes.ENUM('resource_request', 'marketing_updates'), allowNull: false },
  granted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  wording: { type: DataTypes.TEXT, allowNull: false },
  policyVersion: { type: DataTypes.STRING(40), allowNull: false, defaultValue: 'pulse-privacy-1.0' },
  evidence: { type: DataTypes.JSON, allowNull: false, defaultValue: {} },
  withdrawnAt: { type: DataTypes.DATE, allowNull: true },
}, { ...standard, indexes: [{ unique: true, fields: ['session_id', 'consent_type'] }, { fields: ['lead_id', 'consent_type', 'granted'] }] });

export const PulseLeadResult = sequelize.define('PulseLeadResult', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  leadId: { type: DataTypes.UUID, allowNull: false },
  sessionId: { type: DataTypes.UUID, allowNull: false, unique: true },
  scoreVersion: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '1.0.0' },
  portfolioVisibilityScore: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0, max: 100 } },
  strategicConnectionScore: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0, max: 100 } },
  decisionReadinessScore: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0, max: 100 } },
  overallScore: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0, max: 100 } },
  bandCode: { type: DataTypes.STRING(80), allowNull: false },
  bandLabel: { type: DataTypes.STRING(160), allowNull: false },
  summary: { type: DataTypes.TEXT, allowNull: false },
  actions: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
}, standard);

export const PulseLeadNotification = sequelize.define('PulseLeadNotification', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  leadId: { type: DataTypes.UUID, allowNull: false },
  sessionId: { type: DataTypes.UUID, allowNull: false },
  notificationType: { type: DataTypes.ENUM('recipient_email', 'internal_alert', 'crm_webhook'), allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'sending', 'sent', 'failed', 'disabled'), allowNull: false, defaultValue: 'pending' },
  attemptCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  nextAttemptAt: { type: DataTypes.DATE, allowNull: true },
  lastAttemptAt: { type: DataTypes.DATE, allowNull: true },
  deliveredAt: { type: DataTypes.DATE, allowNull: true },
  providerReference: { type: DataTypes.STRING(255), allowNull: true },
  responseStatus: { type: DataTypes.INTEGER, allowNull: true },
  lastError: { type: DataTypes.STRING(1000), allowNull: true },
  payload: { type: DataTypes.JSON, allowNull: true },
}, { ...standard, indexes: [{ unique: true, fields: ['session_id', 'notification_type'] }, { fields: ['status', 'next_attempt_at'] }, { fields: ['lead_id', 'created_at'] }] });

// Short-lived, single-use ALTCHA challenge records protect public and support-contact submissions.
export const PublicFormChallenge = sequelize.define('PublicFormChallenge', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  purpose: { type: DataTypes.STRING(80), allowNull: false },
  signature: { type: DataTypes.STRING(500), allowNull: false, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  consumedAt: { type: DataTypes.DATE, allowNull: true },
  ipHash: { type: DataTypes.STRING(128), allowNull: true },
}, { timestamps: true, updatedAt: false, underscored: true, paranoid: false, indexes: [{ name: 'pfch_purpose_expiry_consumed', fields: ['purpose', 'expires_at', 'consumed_at'] }] });

// Public enquiries remain outside tenant and project data, with internal-alert and Council Proof confirmation delivery state retained for accountable follow-up.
export const PublicContactEnquiry = sequelize.define('PublicContactEnquiry', {
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  firstName: { type: DataTypes.STRING(80), allowNull: false },
  lastName: { type: DataTypes.STRING(80), allowNull: false },
  email: { type: DataTypes.STRING(191), allowNull: false, validate: { isEmail: true } },
  councilName: { type: DataTypes.STRING(180), allowNull: true },
  role: { type: DataTypes.STRING(160), allowNull: true },
  enquiryType: { type: DataTypes.ENUM('sales', 'council_proof', 'general'), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: false },
  privacyAcknowledgedAt: { type: DataTypes.DATE, allowNull: false },
  sourceUrl: { type: DataTypes.STRING(1000), allowNull: true },
  referrer: { type: DataTypes.STRING(1000), allowNull: true },
  ipHash: { type: DataTypes.STRING(128), allowNull: true },
  userAgentHash: { type: DataTypes.STRING(128), allowNull: true },
  notificationStatus: { type: DataTypes.ENUM('pending', 'sent', 'failed', 'disabled'), allowNull: false, defaultValue: 'pending' },
  notificationAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  notificationLastAttemptAt: { type: DataTypes.DATE, allowNull: true },
  notificationNextAttemptAt: { type: DataTypes.DATE, allowNull: true },
  notificationDeliveredAt: { type: DataTypes.DATE, allowNull: true },
  notificationProviderReference: { type: DataTypes.STRING(255), allowNull: true },
  notificationError: { type: DataTypes.STRING(1000), allowNull: true },
  confirmationStatus: { type: DataTypes.ENUM('not_applicable', 'pending', 'sent', 'failed', 'disabled'), allowNull: false, defaultValue: 'not_applicable' },
  confirmationAttempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  confirmationLastAttemptAt: { type: DataTypes.DATE, allowNull: true },
  confirmationNextAttemptAt: { type: DataTypes.DATE, allowNull: true },
  confirmationDeliveredAt: { type: DataTypes.DATE, allowNull: true },
  confirmationProviderReference: { type: DataTypes.STRING(255), allowNull: true },
  confirmationError: { type: DataTypes.STRING(1000), allowNull: true },
  followUpStatus: { type: DataTypes.ENUM('new', 'contacted', 'follow_up_due', 'nurture', 'closed', 'not_a_fit'), allowNull: false, defaultValue: 'new' },
  followUpDueAt: { type: DataTypes.DATE, allowNull: true },
  followUpNote: { type: DataTypes.TEXT, allowNull: true },
  followUpOwnerId: { type: DataTypes.UUID, allowNull: true },
  followUpUpdatedAt: { type: DataTypes.DATE, allowNull: true },
  followUpResolvedAt: { type: DataTypes.DATE, allowNull: true },
}, { timestamps: true, underscored: true, paranoid: false, indexes: [{ name: 'pce_notification_retry', fields: ['notification_status', 'notification_next_attempt_at'] }, { name: 'pce_confirmation_retry', fields: ['confirmation_status', 'confirmation_next_attempt_at'] }, { name: 'pce_email_created', fields: ['email', 'created_at'] }, { name: 'pce_follow_up_queue', fields: ['follow_up_status', 'follow_up_due_at', 'created_at'] }] });

Organization.hasMany(User, { foreignKey: 'organizationId' });
User.belongsTo(Organization, { foreignKey: 'organizationId' });
Organization.hasMany(Subscription, { foreignKey: 'organizationId' });
Subscription.belongsTo(Organization, { foreignKey: 'organizationId' });
Subscription.belongsTo(ProductPlan, { foreignKey: 'planId' });
Organization.hasMany(IntegrationConnection, { foreignKey: 'organizationId' });
IntegrationConnection.belongsTo(Organization, { foreignKey: 'organizationId' });
Organization.hasMany(SupportCase, { foreignKey: 'organizationId' });
SupportCase.belongsTo(Organization, { foreignKey: 'organizationId' });
SupportCase.hasMany(SupportAttachment, { foreignKey: 'supportCaseId', onDelete: 'CASCADE' });
SupportAttachment.belongsTo(SupportCase, { foreignKey: 'supportCaseId' });
Organization.hasMany(SupportAttachment, { foreignKey: 'organizationId' });
SupportAttachment.belongsTo(Organization, { foreignKey: 'organizationId' });
SupportAttachment.belongsTo(User, { as: 'uploadedByUser', foreignKey: 'uploadedBy' });
Organization.hasMany(CustomerContact, { foreignKey: 'organizationId' });
CustomerContact.belongsTo(Organization, { foreignKey: 'organizationId' });
Organization.hasMany(CustomerNote, { foreignKey: 'organizationId' });
CustomerNote.belongsTo(Organization, { foreignKey: 'organizationId' });
CustomerNote.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
Organization.hasMany(TenantStateEvent, { foreignKey: 'organizationId' });
TenantStateEvent.belongsTo(Organization, { foreignKey: 'organizationId' });
TenantStateEvent.belongsTo(User, { as: 'actor', foreignKey: 'actorId' });
Organization.hasMany(SelectorOptionSet, { foreignKey: 'organizationId' });
SelectorOptionSet.belongsTo(Organization, { foreignKey: 'organizationId' });
SelectorOptionSet.hasMany(SelectorOption, { foreignKey: 'optionSetId' });
SelectorOption.belongsTo(SelectorOptionSet, { foreignKey: 'optionSetId' });
Organization.hasMany(SelectorOption, { foreignKey: 'organizationId' });
SelectorOption.belongsTo(Organization, { foreignKey: 'organizationId' });
Organization.hasMany(OrganizationSelectorOptionOverride, { foreignKey: 'organizationId' });
OrganizationSelectorOptionOverride.belongsTo(Organization, { foreignKey: 'organizationId' });
SelectorOption.hasMany(OrganizationSelectorOptionOverride, { foreignKey: 'optionId' });
OrganizationSelectorOptionOverride.belongsTo(SelectorOption, { foreignKey: 'optionId' });
OrganizationSelectorOptionOverride.belongsTo(User, { as: 'updatedByUser', foreignKey: 'updatedBy' });
Organization.hasMany(Priority, { foreignKey: 'organizationId' });
Organization.hasMany(CivicProject, { foreignKey: 'organizationId' });
Priority.hasMany(CivicProject, { foreignKey: 'priorityId' });
CivicProject.belongsTo(Priority, { foreignKey: 'priorityId' });
CivicProject.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });
CivicProject.hasMany(ProjectPriority, { foreignKey: 'projectId' });
ProjectPriority.belongsTo(CivicProject, { foreignKey: 'projectId' });
Priority.hasMany(ProjectPriority, { foreignKey: 'priorityId' });
ProjectPriority.belongsTo(Priority, { foreignKey: 'priorityId' });
ProjectPriority.belongsTo(User, { as: 'assignedByUser', foreignKey: 'assignedBy' });
CivicProject.hasMany(ProjectSelectorValue, { foreignKey: 'projectId' });
ProjectSelectorValue.belongsTo(CivicProject, { foreignKey: 'projectId' });
ProjectSelectorValue.belongsTo(SelectorOptionSet, { foreignKey: 'optionSetId' });
ProjectSelectorValue.belongsTo(SelectorOption, { foreignKey: 'optionId' });
ProjectSelectorValue.belongsTo(User, { as: 'selectedByUser', foreignKey: 'selectedBy' });
CivicProject.hasMany(ProjectConstraint, { foreignKey: 'projectId' });
ProjectConstraint.belongsTo(CivicProject, { foreignKey: 'projectId' });
ProjectConstraint.belongsTo(SelectorOption, { as: 'constraintOption', foreignKey: 'constraintOptionId' });
ProjectConstraint.belongsTo(SelectorOption, { as: 'severityOption', foreignKey: 'severityOptionId' });
ProjectConstraint.belongsTo(SelectorOption, { as: 'statusOption', foreignKey: 'statusOptionId' });
ProjectConstraint.belongsTo(User, { as: 'constraintOwner', foreignKey: 'ownerId' });
ProjectConstraint.belongsTo(User, { as: 'constraintCreator', foreignKey: 'createdBy' });
CivicProject.hasMany(ReadinessAssessment, { foreignKey: 'projectId' });
ReadinessAssessment.belongsTo(CivicProject, { foreignKey: 'projectId' });
CivicProject.hasMany(FundingPathway, { foreignKey: 'projectId' });
FundingPathway.belongsTo(CivicProject, { foreignKey: 'projectId' });
CivicProject.hasMany(Grant, { foreignKey: 'projectId' });
Grant.belongsTo(CivicProject, { foreignKey: 'projectId' });
Grant.belongsTo(FundingPathway, { foreignKey: 'fundingPathwayId' });
Grant.belongsTo(User, { as: 'lead', foreignKey: 'leadId' });
CivicProject.hasMany(WorkItem, { foreignKey: 'projectId' });
Grant.hasMany(WorkItem, { foreignKey: 'grantId' });
WorkItem.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });
CivicProject.hasMany(EvidenceItem, { foreignKey: 'projectId' });
Grant.hasMany(EvidenceItem, { foreignKey: 'grantId' });
PublicLead.hasMany(PulseLeadSession, { foreignKey: 'leadId' });
PulseLeadSession.belongsTo(PublicLead, { foreignKey: 'leadId' });
PublicLead.hasMany(PulseLeadConsent, { foreignKey: 'leadId' });
PulseLeadConsent.belongsTo(PublicLead, { foreignKey: 'leadId' });
PublicLead.hasMany(PulseLeadResult, { foreignKey: 'leadId' });
PulseLeadResult.belongsTo(PublicLead, { foreignKey: 'leadId' });
PublicLead.hasMany(PulseLeadNotification, { foreignKey: 'leadId' });
PulseLeadNotification.belongsTo(PublicLead, { foreignKey: 'leadId' });
PublicContactEnquiry.belongsTo(User, { as: 'followUpOwner', foreignKey: 'followUpOwnerId' });
export const models = { Organization, User, ProductPlan, Subscription, IntegrationConnection, PlatformSetting, SupportCase, SupportAttachment, CustomerContact, CustomerNote, TenantStateEvent, SelectorOptionSet, SelectorOption, OrganizationSelectorOptionOverride, Priority, CivicProject, ProjectPriority, ProjectSelectorValue, ProjectConstraint, ReadinessAssessment, FundingPathway, Grant, WorkItem, EvidenceItem, AuditLog, PublicLead, PulseLeadSession, PulseLeadConsent, PulseLeadResult, PulseLeadNotification, PublicFormChallenge, PublicContactEnquiry };
