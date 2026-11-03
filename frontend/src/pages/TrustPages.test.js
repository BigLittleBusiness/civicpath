import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DashboardPage from './DashboardPage';
import PortfolioPage from './PortfolioPage';
import { SetupChecklist, WorkspaceProfilePanel } from '../components/WorkspaceSetupPanel';
import { api } from '../lib/api';

let mockUser;
jest.mock('../features/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
jest.mock('../lib/api', () => ({ api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() }, importCsv: jest.fn() }));
jest.mock('react-hot-toast', () => ({ __esModule: true, default: { error: jest.fn(), success: jest.fn() }, toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('react-router-dom', () => ({ Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a> }));
jest.mock('../components/RoleHelpPanel', () => ({ TopHelpPanel: () => null, ContextualHelpLink: () => null }));
jest.mock('recharts', () => {
  const Box = ({ children }) => <div>{children}</div>;
  const Null = () => null;
  return { Bar: Null, BarChart: Box, CartesianGrid: Null, Cell: Null, Pie: Box, PieChart: Box, ResponsiveContainer: Box, Tooltip: Null, XAxis: Null, YAxis: Null };
});
const tenant = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const project = { id, organizationId: tenant, name: 'Real Council Project', stage: 'concept', estimatedCost: 0, targetFunding: 0, securedFunding: 0, expectedJobs: 0 };
const envelope = (data) => ({ data: { data } });
const overview = { projects: [], pathways: [], workItems: [], summary: { strategyCount: 0 } };
const profile = { profile: { id: tenant, name: 'Council', workspaceOwnerId: null, operatingContactName: '', operatingContactRole: '', operatingContactEmail: '' }, eligibleOwners: [] };
let mockProjects;
function configure({ projects = [], role = 'org_admin', demo = false } = {}) {
  mockUser = { id: 'me', organizationId: tenant, role, organisationIsDemo: demo };
  mockProjects = projects;
  api.get.mockImplementation(async (path) => {
    if (path === '/projects') return envelope(mockProjects);
    if (path === '/dashboard/overview') return envelope(overview);
    if (path === '/workspace/profile') return envelope(profile);
    if (path === '/workspace/members') return envelope({ organization: { id: tenant }, members: [{ id: 'me', status: 'active', isCurrentUser: true }] });
    if (path === '/work-items' || path === '/priorities') return envelope([]);
    if (path === '/council-proof/selectors') return envelope({ currencyCode: 'AUD', selectorSets: { project_category: { options: [{ id: 'category', label: 'Infrastructure' }] }, project_delivery_stage: { options: [{ id: 'stage', label: 'Concept' }] } } });
    throw new Error(`Unexpected read: ${path}`);
  });
}
beforeEach(() => { jest.clearAllMocks(); configure(); });

test('empty live dashboard preserves zero pathways and no sample or funding trend', async () => {
  render(<DashboardPage/>);
  await screen.findByText('0 recorded funding pathways');
  expect(screen.getByText('No funding pathways with a recorded potential amount. No funding history is available.')).toBeTruthy();
  expect(screen.queryByText(/Regional workforce housing/)).toBeNull();
  expect(screen.queryByText('Demonstration workspace · illustrative records')).toBeNull();
  expect(screen.getByText('Not assessed')).toBeTruthy();
});
test('failed live dashboard shows unavailable metrics and retry without samples', async () => {
  api.get.mockRejectedValue(new Error('Offline'));
  render(<DashboardPage/>);
  await screen.findByRole('button', { name: 'Retry loading dashboard' });
  expect(screen.getAllByText('Unavailable').length).toBeGreaterThan(0);
  expect(screen.queryByText(/Livestock & freight/)).toBeNull();
  expect(screen.queryByText('Demonstration workspace · illustrative records')).toBeNull();
  configure(); fireEvent.click(screen.getByRole('button', { name: 'Retry loading dashboard' }));
  await screen.findByText('0 recorded funding pathways');
});
test('explicit demo tenant is visibly labelled but an empty demo never receives static rows', async () => {
  configure({ demo: true }); render(<PortfolioPage/>);
  await screen.findByText(/No projects are recorded yet/);
  expect(screen.getByText('Demonstration workspace · illustrative records')).toBeTruthy();
  expect(screen.queryByText(/Regional workforce housing/)).toBeNull();
});
test('empty live portfolio exposes genuine creation once catalogue is available', async () => {
  render(<PortfolioPage/>);
  await screen.findByText(/No projects are recorded yet/);
  const add = screen.getByRole('button', { name: 'Add project' });
  await waitFor(() => expect(add.disabled).toBe(false)); fireEvent.click(add);
  expect(screen.getByRole('dialog', { name: 'Add a project' })).toBeTruthy();
  expect(screen.queryByText(/Livestock & freight/)).toBeNull();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});
test('failed portfolio has no fabricated detail; retry loads real rows only', async () => {
  api.get.mockRejectedValue(new Error('Offline')); render(<PortfolioPage/>);
  await screen.findByRole('button', { name: 'Retry loading projects' });
  expect(screen.queryByRole('heading', { name: 'What moves this forward?' })).toBeNull();
  expect(screen.queryByText(/Regional workforce housing/)).toBeNull();
  configure({ projects: [project] }); fireEvent.click(screen.getByRole('button', { name: 'Retry loading projects' }));
  await screen.findByRole('heading', { level: 2, name: project.name });
  expect(screen.getAllByText('Not assessed').length).toBeGreaterThan(0);
});
test('readiness control opens genuine record editor and writes existing API contract', async () => {
  configure({ projects: [project] });
  api.post.mockResolvedValue(envelope({ id: 'assessment', projectId: id, organizationId: tenant, score: 0, scopeScore: 0, costScore: 0, approvalsScore: 0, partnerScore: 0, fundingScore: 0, deliveryScore: 0 }));
  render(<PortfolioPage/>);
  fireEvent.click(await screen.findByRole('button', { name: `Open readiness assessment for ${project.name}` }));
  expect(screen.getByRole('dialog', { name: project.name })).toBeTruthy();
  for (const label of ['Scope', 'Cost', 'Approvals', 'Partners', 'Funding fit', 'Delivery']) fireEvent.change(screen.getByLabelText(label), { target: { value: '0' } });
  fireEvent.change(screen.getByLabelText('Evidence and assessment note'), { target: { value: 'Recorded evidence and outstanding gaps.' } });
  fireEvent.click(screen.getByRole('button', { name: 'Record assessment' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/projects/${id}/readiness-assessments`, expect.objectContaining({ scopeScore: 0, deliveryScore: 0 })));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getAllByText('0%').length).toBeGreaterThan(0);
});
test('executive portfolio is read-only including the assessment dialog', async () => {
  configure({ projects: [project], role: 'executive' }); render(<PortfolioPage/>);
  fireEvent.click(await screen.findByRole('button', { name: `Open readiness assessment for ${project.name}` }));
  expect(screen.queryByRole('button', { name: 'Record assessment' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add project' })).toBeNull();
  expect(screen.getByText(/Read-only. An Organisation Administrator/)).toBeTruthy();
  expect(api.post).not.toHaveBeenCalled();
  expect(api.get.mock.calls.flat()).not.toContain('/workspace/members');
});
test('portfolio filter with no matches cannot keep an unrelated selected detail', async () => {
  configure({ projects: [project] }); render(<PortfolioPage/>);
  await screen.findByRole('heading', { level: 2, name: project.name });
  fireEvent.change(screen.getByRole('textbox', { name: 'Search projects' }), { target: { value: 'nonmatching' } });
  expect(screen.queryByRole('heading', { level: 2, name: project.name })).toBeNull();
  expect(screen.getByText('No projects match this search or filter.')).toBeTruthy();
});
test('tenant transition clears old project detail before a new request resolves', async () => {
  configure({ projects: [project] }); const { rerender } = render(<PortfolioPage/>);
  await screen.findByRole('heading', { level: 2, name: project.name });
  mockUser = { ...mockUser, organizationId: '00000000-0000-4000-8000-000000000099' };
  api.get.mockImplementation(() => new Promise(() => {})); rerender(<PortfolioPage/>);
  expect(screen.queryByRole('heading', { level: 2, name: project.name })).toBeNull();
  expect(screen.getByText(/Loading this workspace’s project register/)).toBeTruthy();
});
test('checklist does not mark owner complete just because user is admin', async () => {
  render(<SetupChecklist projectCount={0} strategyCount={0}/>);
  await screen.findByText('Choose an active owner and record the contact name, role and email.');
  expect(screen.getByText('0/4')).toBeTruthy();
});
test('executive checklist obtains shared profile but never requests private member list', async () => {
  configure({ role: 'executive' }); render(<SetupChecklist projectCount={1} strategyCount={1}/>);
  await screen.findByText(/Team readiness unavailable to this view/);
  expect(api.get.mock.calls.map(([path]) => path)).toEqual(['/workspace/profile']);
  expect(screen.getByText('2/4')).toBeTruthy();
});
test('workspace profile error is an actionable error instead of endless loading', async () => {
  api.get.mockRejectedValue(new Error('Offline')); render(<WorkspaceProfilePanel user={mockUser}/>);
  await screen.findByText('Workspace profile could not be verified.');
  expect(screen.getByRole('button', { name: 'Retry workspace profile' })).toBeTruthy();
  expect(screen.queryByText('Loading workspace profile…')).toBeNull();
});

test('first created project is the sole real row and is never mixed with sample records', async () => {
  api.post.mockResolvedValue(envelope(project)); render(<PortfolioPage/>);
  const add = screen.getByRole('button', { name: 'Add project' }); await waitFor(() => expect(add.disabled).toBe(false));
  fireEvent.click(add); fireEvent.change(screen.getByLabelText('Project name'), { target: { value: project.name } });
  const category = screen.getByPlaceholderText('Search project types'); fireEvent.focus(category); fireEvent.click(screen.getByRole('option', { name: 'Infrastructure' }));
  const stage = screen.getByPlaceholderText('Search delivery stages'); fireEvent.focus(stage); fireEvent.click(screen.getByRole('option', { name: 'Concept' }));
  fireEvent.submit(screen.getByRole('dialog'));
  await screen.findByRole('heading', { level: 2, name: project.name });
  expect(api.post).toHaveBeenCalledWith('/projects', expect.objectContaining({ name: project.name }));
  expect(screen.getAllByRole('heading', { level: 3, name: project.name })).toHaveLength(1);
  expect(screen.queryByText(/Regional workforce housing/)).toBeNull();
  expect(screen.queryByText(/No projects are recorded yet/)).toBeNull();
});
test('readiness API failure remains an actionable dialog error without changing assessment', async () => {
  configure({ projects: [project] }); api.post.mockRejectedValue(new Error('Offline'));
  render(<PortfolioPage/>); fireEvent.click(await screen.findByRole('button', { name: `Open readiness assessment for ${project.name}` }));
  for (const label of ['Scope', 'Cost', 'Approvals', 'Partners', 'Funding fit', 'Delivery']) fireEvent.change(screen.getByLabelText(label), { target: { value: '3' } });
  fireEvent.change(screen.getByLabelText('Evidence and assessment note'), { target: { value: 'Recorded evidence and outstanding gaps.' } });
  fireEvent.submit(screen.getByRole('dialog')); await screen.findByRole('alert');
  expect(screen.getByRole('dialog')).toBeTruthy(); expect(screen.queryByText('60%')).toBeNull();
});
test('checklist refresh reflects actual accepted access and confirmed owner', async () => {
  render(<SetupChecklist projectCount={1} strategyCount={1}/>);
  await screen.findByText('2/4');
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh owner and team status' }).disabled).toBe(false));
  const configured = { profile: { ...profile.profile, workspaceOwnerId: 'owner', operatingContactName: 'Council Contact', operatingContactRole: 'Manager', operatingContactEmail: 'contact@example.test' }, eligibleOwners: [{ id: 'owner', role: 'portfolio_manager' }] };
  api.get.mockImplementation(async (path) => envelope(path === '/workspace/profile' ? configured : { organization: { id: tenant }, members: [{ id: 'colleague', status: 'active' }] }));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh owner and team status' }));
  await screen.findByText('4/4');
  expect(screen.getByText(/1 active colleagues; 0 pending invitations/)).toBeTruthy();
});

/* eslint-disable testing-library/no-node-access -- activeElement is required to verify keyboard focus containment and restoration. */
test('readiness dialog traps tab focus and restores the trigger on Escape', async () => {
  configure({ projects: [project] }); render(<PortfolioPage/>);
  const trigger = await screen.findByRole('button', { name: `Open readiness assessment for ${project.name}` });
  trigger.focus(); fireEvent.click(trigger);
  const dialog = screen.getByRole('dialog'); const first = screen.getByRole('button', { name: 'Close readiness assessment' }); const last = screen.getByRole('button', { name: 'Record assessment' });
  expect(document.activeElement).toBe(first);
  first.focus(); fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last);
  last.focus(); fireEvent.keyDown(dialog, { key: 'Tab' }); expect(document.activeElement).toBe(first);
  fireEvent.keyDown(dialog, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(trigger);
});
/* eslint-enable testing-library/no-node-access */
test('executive profile displays real identity read-only without a member list or save action', async () => {
  configure({ role: 'executive' }); render(<WorkspaceProfilePanel user={mockUser}/>);
  await screen.findByRole('heading', { name: 'Council' });
  expect(screen.getByText('No eligible active owner recorded')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save workspace profile' })).toBeNull();
  expect(api.get.mock.calls.map(([path]) => path)).toEqual(['/workspace/profile']);
  expect(api.patch).not.toHaveBeenCalled();
});
