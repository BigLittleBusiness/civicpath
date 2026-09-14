import bcrypt from 'bcryptjs';
import { sequelize } from '../../src/config/database.js';
import { Organization, User, ProductPlan, Subscription, Priority, CivicProject, ReadinessAssessment, FundingPathway, Grant, WorkItem, EvidenceItem, CustomerContact, CustomerNote, TenantStateEvent } from '../../src/models/index.js';

const demo = { name: 'CivicPath Demonstration Council', slug: 'civicpath-demo', country: 'AU', organisationType: 'demo', planCode: 'core', isDemo: true, status: 'active' };

try {
  await sequelize.authenticate();
  await sequelize.sync();
  const [organisation] = await Organization.findOrCreate({ where: { slug: demo.slug }, defaults: demo });
  const [platformOrganisation] = await Organization.findOrCreate({ where: { slug: 'civicpath-platform' }, defaults: { name: 'CivicPath Platform', slug: 'civicpath-platform', country: 'AU', organisationType: 'platform', planCode: 'internal', status: 'active' } });
  const passwordHash = await bcrypt.hash('CivicPathDemo2026!', 12);
  const [manager] = await User.findOrCreate({ where: { organizationId: organisation.id, email: 'demo@civicpath.com.au' }, defaults: { organizationId: organisation.id, email: 'demo@civicpath.com.au', firstName: 'Jordan', lastName: 'Reid', passwordHash, role: 'org_admin', status: 'active' } });
  const [platformAdmin] = await User.findOrCreate({ where: { organizationId: platformOrganisation.id, email: 'admin@civicpath.com.au' }, defaults: { organizationId: platformOrganisation.id, email: 'admin@civicpath.com.au', firstName: 'System', lastName: 'Administrator', passwordHash: await bcrypt.hash('CivicPathAdmin2026!', 12), role: 'platform_admin', status: 'active', mfaRequired: true } });
  await platformAdmin.update({ mfaRequired: true });
  await CustomerContact.findOrCreate({ where: { organizationId: organisation.id, email: 'chief.executive@democouncil.nsw.gov.au' }, defaults: { organizationId: organisation.id, name: 'Morgan Ellis', email: 'chief.executive@democouncil.nsw.gov.au', title: 'Chief Executive Officer', contactType: 'executive', isAuthorised: true, createdBy: platformAdmin.id } });
  await CustomerContact.findOrCreate({ where: { organizationId: organisation.id, email: 'finance@democouncil.nsw.gov.au' }, defaults: { organizationId: organisation.id, name: 'Taylor Green', email: 'finance@democouncil.nsw.gov.au', title: 'Manager Corporate Services', contactType: 'billing', isAuthorised: true, createdBy: platformAdmin.id } });
  await CustomerNote.findOrCreate({ where: { organizationId: organisation.id, body: 'Illustrative Customer 360° note. Replace all demonstration records when a live Council workspace is created.' }, defaults: { organizationId: organisation.id, authorId: platformAdmin.id, body: 'Illustrative Customer 360° note. Replace all demonstration records when a live Council workspace is created.', visibility: 'internal' } });
  await TenantStateEvent.findOrCreate({ where: { organizationId: organisation.id, fromStatus: 'trial', toStatus: 'active', reason: 'Illustrative demonstration tenant activation.' }, defaults: { organizationId: organisation.id, fromStatus: 'trial', toStatus: 'active', reason: 'Illustrative demonstration tenant activation.', actorId: platformAdmin.id } });
  const [corePlan] = await ProductPlan.findOrCreate({ where: { code: 'civicpath-core' }, defaults: { code: 'civicpath-core', name: 'CivicPath Core', product: 'civicpath', annualPriceAud: 5000, workflowUserLimit: 8, activeProjectLimit: 75, activeGrantLimit: 0, features: { projectPortfolio: true, fundingPathways: true, reporting: true } } });
  await Subscription.findOrCreate({ where: { organizationId: organisation.id, planId: corePlan.id }, defaults: { organizationId: organisation.id, planId: corePlan.id, status: 'active', entitlements: { civicpathCore: true, grantLifecycle: true, demo: true } } });
  const priorities = await Promise.all([
    ['A resilient regional economy', 'Economic Development Strategy 2026–2030', 'Economic resilience'],
    ['A capable and connected community', 'Community Strategic Plan', 'Workforce participation'],
    ['Infrastructure ready for growth', 'Delivery Program', 'Strategic infrastructure'],
  ].map(async ([title, planReference, outcomeArea]) => (await Priority.findOrCreate({ where: { organizationId: organisation.id, title }, defaults: { organizationId: organisation.id, title, planReference, outcomeArea } }))[0]));
  const projectDefinitions = [
    { name: 'Regional workforce housing pathway', category: 'strategic_planning', stage: 'business_case', estimatedCost: 2800000, targetFunding: 1900000, securedFunding: 0, expectedJobs: 18, expectedBenefit: 'Enables recruitment and retention across priority services.', targetDate: '2027-06-30', readiness: 72, priority: priorities[1] },
    { name: 'Livestock and freight services precinct', category: 'economic_development', stage: 'funding_ready', estimatedCost: 1600000, targetFunding: 1200000, securedFunding: 0, expectedJobs: 12, expectedBenefit: 'Strengthens value capture around livestock and heavy-vehicle activity.', targetDate: '2027-12-31', readiness: 84, priority: priorities[0] },
    { name: 'Water-smart agribusiness capability program', category: 'economic_development', stage: 'scoping', estimatedCost: 480000, targetFunding: 350000, securedFunding: 0, expectedJobs: 9, expectedBenefit: 'Builds local technical capability for resilient production.', targetDate: '2027-03-31', readiness: 56, priority: priorities[0] },
    { name: 'Early learning workforce participation hub', category: 'community', stage: 'delivery', estimatedCost: 5600000, targetFunding: 4200000, securedFunding: 4200000, expectedJobs: 24, expectedBenefit: 'Supports workforce participation and local family retention.', targetDate: '2027-10-31', readiness: 91, priority: priorities[1] },
    { name: 'Renewable energy workforce transition program', category: 'economic_development', stage: 'concept', estimatedCost: 750000, targetFunding: 500000, securedFunding: 0, expectedJobs: 22, expectedBenefit: 'Links local firms and residents to energy supply-chain opportunity.', targetDate: '2028-06-30', readiness: 38, priority: priorities[2] },
  ];
  const projects = [];
  for (const definition of projectDefinitions) {
    const { readiness, priority, ...projectAttributes } = definition;
    const [project] = await CivicProject.findOrCreate({ where: { organizationId: organisation.id, name: definition.name }, defaults: { ...projectAttributes, priorityId: priority.id, ownerId: manager.id, isSample: true } });
    projects.push(project);
    const component = Math.round((readiness / 100) * 5);
    await ReadinessAssessment.findOrCreate({ where: { organizationId: organisation.id, projectId: project.id }, defaults: { organizationId: organisation.id, projectId: project.id, scopeScore: component, costScore: component, approvalsScore: Math.max(1, component - 1), partnerScore: component, fundingScore: Math.max(1, component - 1), deliveryScore: component, score: readiness, assessmentNote: 'Illustrative demonstration assessment only.', assessedAt: new Date() } });
  }
  const pathways = [
    [projects[0], 'Regional housing partnership program', 'partner', 'strong', 1500000, '2026-11-15', 'preparing'],
    [projects[1], 'Sustainable Communities capital round', 'grant', 'strong', 1200000, '2027-02-28', 'watching'],
    [projects[2], 'Regional Development Trust', 'grant', 'possible', 350000, '2026-12-01', 'watching'],
    [projects[4], 'Renewable Energy Zone benefits program', 'grant', 'possible', 500000, '2027-04-30', 'watching'],
  ];
  for (const [project, sourceName, sourceType, fit, potentialAmount, dueDate, status] of pathways) await FundingPathway.findOrCreate({ where: { organizationId: organisation.id, projectId: project.id, sourceName }, defaults: { organizationId: organisation.id, projectId: project.id, sourceName, sourceType, fit, potentialAmount, dueDate, status, note: 'Illustrative demonstration funding pathway only.' } });
  const grantDefinitions = [
    [projects[1], 'Livestock precinct enabling works', 'Regional Infrastructure Fund', 1200000, 'preparing', '2027-02-28'],
    [projects[3], 'Perrin Park early learning centre', 'Sustainable Communities Program', 4200000, 'contracted', '2026-10-31'],
    [projects[0], 'Regional workforce housing feasibility', 'Regional Development Trust', 180000, 'assessing', '2026-11-15'],
  ];
  const grants = [];
  for (const [project, title, funder, requestedAmount, status, dueDate] of grantDefinitions) { const [grant] = await Grant.findOrCreate({ where: { organizationId: organisation.id, title }, defaults: { organizationId: organisation.id, projectId: project.id, title, funder, requestedAmount, awardedAmount: status === 'contracted' ? requestedAmount : null, status, dueDate, leadId: manager.id, notes: 'Illustrative demonstration grant record only.', isSample: true } }); grants.push(grant); }
  const workItems = [
    [projects[1], null, 'Confirm operator and site-servicing assumptions', 'decision', 'high', 'blocked', '2026-10-02'],
    [projects[0], null, 'Complete housing demand and delivery options brief', 'action', 'critical', 'in_progress', '2026-09-25'],
    [projects[2], null, 'Identify local training and producer partners', 'action', 'medium', 'not_started', '2026-10-10'],
    [projects[3], grants[1], 'Prepare first claims evidence pack', 'grant_task', 'high', 'in_progress', '2026-10-31'],
    [projects[4], null, 'Record preferred local procurement outcomes', 'risk', 'medium', 'not_started', '2026-11-07'],
  ];
  for (const [project, grant, title, workType, priority, status, dueDate] of workItems) await WorkItem.findOrCreate({ where: { organizationId: organisation.id, title }, defaults: { organizationId: organisation.id, projectId: project.id, grantId: grant?.id || null, ownerId: manager.id, title, workType, priority, status, dueDate, detail: 'Illustrative demonstration work item only.', impact: workType === 'risk' ? 4 : null, likelihood: workType === 'risk' ? 3 : null } });
  await EvidenceItem.findOrCreate({ where: { organizationId: organisation.id, title: 'Demonstration portfolio baseline' }, defaults: { organizationId: organisation.id, projectId: projects[0].id, title: 'Demonstration portfolio baseline', evidenceType: 'metric', source: 'CivicPath demo workspace', isVerified: false } });
  console.info('CivicPath demonstration workspace seeded. Demo sign-in: demo@civicpath.com.au / CivicPathDemo2026!');
} catch (error) { console.error(error); process.exitCode = 1; } finally { await sequelize.close(); }
