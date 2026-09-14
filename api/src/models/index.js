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
  expectedJobs: { type: DataTypes.INTEGER, allowNull: true },
  expectedBenefit: { type: DataTypes.STRING(240), allowNull: true },
  targetDate: { type: DataTypes.DATEONLY, allowNull: true },
  isSample: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
}, standard);

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

Organization.hasMany(User, { foreignKey: 'organizationId' });
User.belongsTo(Organization, { foreignKey: 'organizationId' });
Organization.hasMany(Subscription, { foreignKey: 'organizationId' });
Subscription.belongsTo(Organization, { foreignKey: 'organizationId' });
Subscription.belongsTo(ProductPlan, { foreignKey: 'planId' });
Organization.hasMany(IntegrationConnection, { foreignKey: 'organizationId' });
IntegrationConnection.belongsTo(Organization, { foreignKey: 'organizationId' });
Organization.hasMany(SupportCase, { foreignKey: 'organizationId' });
SupportCase.belongsTo(Organization, { foreignKey: 'organizationId' });
Organization.hasMany(CustomerContact, { foreignKey: 'organizationId' });
CustomerContact.belongsTo(Organization, { foreignKey: 'organizationId' });
Organization.hasMany(CustomerNote, { foreignKey: 'organizationId' });
CustomerNote.belongsTo(Organization, { foreignKey: 'organizationId' });
CustomerNote.belongsTo(User, { as: 'author', foreignKey: 'authorId' });
Organization.hasMany(TenantStateEvent, { foreignKey: 'organizationId' });
TenantStateEvent.belongsTo(Organization, { foreignKey: 'organizationId' });
TenantStateEvent.belongsTo(User, { as: 'actor', foreignKey: 'actorId' });
Organization.hasMany(Priority, { foreignKey: 'organizationId' });
Organization.hasMany(CivicProject, { foreignKey: 'organizationId' });
Priority.hasMany(CivicProject, { foreignKey: 'priorityId' });
CivicProject.belongsTo(Priority, { foreignKey: 'priorityId' });
CivicProject.belongsTo(User, { as: 'owner', foreignKey: 'ownerId' });
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

export const models = { Organization, User, ProductPlan, Subscription, IntegrationConnection, PlatformSetting, SupportCase, CustomerContact, CustomerNote, TenantStateEvent, Priority, CivicProject, ReadinessAssessment, FundingPathway, Grant, WorkItem, EvidenceItem, AuditLog };
