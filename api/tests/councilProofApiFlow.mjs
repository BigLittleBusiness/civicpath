import jwt from 'jsonwebtoken';
import { CivicProject, Organization, ProjectConstraint, ProjectPriority, ProjectSelectorValue } from '../src/models/index.js';
import { sequelize } from '../src/config/database.js';
import { env } from '../src/config/env.js';

const baseUrl = process.env.CIVICPATH_TEST_URL || 'http://127.0.0.1:3017/v1';
const demo = { email: 'demo@civicpath.com.au', password: 'CivicPathDemo2026!' };
let cookie = '';
let createdProjectId;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(options.headers || {}) } });
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  const body = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(`${path}: ${body.error || response.status}`);
  return body;
}

try {
  await sequelize.authenticate();
  const login = await request('/auth/login', { method: 'POST', body: JSON.stringify(demo) });
  if (login.data?.user?.role !== 'org_admin') throw new Error('Demo Council administrator sign-in failed.');
  const [selectorResponse, priorityResponse] = await Promise.all([request('/council-proof/selectors'), request('/priorities')]);
  const { selectorSets, currencyCode } = selectorResponse.data;
  if (currencyCode !== 'AUD' || !selectorSets.project_category?.options?.length || !selectorSets.project_constraint?.options?.length) throw new Error('Tenant selector catalogue is incomplete.');
  const priority = priorityResponse.data[0];
  const category = selectorSets.project_category.options.find((option) => option.code === 'economic_development');
  const stage = selectorSets.project_delivery_stage.options.find((option) => option.code === 'concept');
  const constraint = selectorSets.project_constraint.options.find((option) => option.code === 'scope_definition');
  const material = selectorSets.constraint_severity.options.find((option) => option.code === 'material');
  const open = selectorSets.constraint_status.options.find((option) => option.code === 'open');
  const created = await request('/projects', { method: 'POST', body: JSON.stringify({ name: `Council Proof API smoke ${Date.now()}`, currencyCode, estimatedCost: 250000, targetFunding: 150000, priorityIds: [priority.id], categorySelection: { optionId: category.id }, stageSelection: { optionId: stage.id }, constraintSelections: [{ constraintOptionId: constraint.id, severityOptionId: material.id, statusOptionId: open.id, detail: 'Controlled API test record.' }] }) });
  createdProjectId = created.data.id;
  const detail = await request(`/projects/${createdProjectId}/council-proof`);
  if (detail.data.priorities.length !== 1 || detail.data.constraints.length !== 1 || detail.data.selections.length < 2) throw new Error('Council Proof project detail did not persist governed values.');
  const delivery = selectorSets.project_delivery_stage.options.find((option) => option.code === 'business_case');
  await request(`/projects/${createdProjectId}/selectors/project_delivery_stage`, { method: 'PUT', body: JSON.stringify({ selections: [{ optionId: delivery.id }] }) });
  const updated = await request(`/projects/${createdProjectId}/council-proof`);
  if (updated.data.project.stage !== 'business_case') throw new Error('Legacy delivery-stage field was not synchronised from the controlled selector.');
  const platformOrganization = await Organization.findOne({ where: { slug: 'civicpath-platform' } });
  const crossTenantToken = jwt.sign({ sub: 'cross-tenant-test', organizationId: platformOrganization.id, role: 'org_admin' }, env.jwtSecret, { expiresIn: '5m' });
  const denied = await fetch(`${baseUrl}/projects/${createdProjectId}/council-proof`, { headers: { authorization: `Bearer ${crossTenantToken}` } });
  if (denied.status !== 404) throw new Error('Cross-tenant project detail was not denied.');
  console.info('Council Proof tenant-scoped API flow passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (createdProjectId) {
    await ProjectConstraint.destroy({ where: { projectId: createdProjectId }, force: true });
    await ProjectSelectorValue.destroy({ where: { projectId: createdProjectId }, force: true });
    await ProjectPriority.destroy({ where: { projectId: createdProjectId }, force: true });
    await CivicProject.destroy({ where: { id: createdProjectId }, force: true });
  }
  await sequelize.close();
}
