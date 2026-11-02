import { getWorkspaceSettingsSections } from './workspaceSettings';

describe('Workspace settings role navigation', () => {
  const councilRoles = ['org_admin', 'portfolio_manager', 'contributor', 'executive'];

  it('shows People and Access only to Organisation Administrators', () => {
    councilRoles.forEach((role) => {
      const sections = getWorkspaceSettingsSections(role).map((section) => section.id);
      expect(sections.includes('people')).toBe(role === 'org_admin');
    });
  });

  it('keeps safe shared settings and support routes available to every council role', () => {
    councilRoles.forEach((role) => {
      const sections = getWorkspaceSettingsSections(role).map((section) => section.id);
      expect(sections).toEqual(expect.arrayContaining(['general', 'imports', 'billing', 'support']));
    });
  });
});
