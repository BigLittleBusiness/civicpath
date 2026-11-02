import { ROLE_HELP, getRoleHelp, getTopHelp, questionLabel, searchRoleHelp } from './roleHelp';

describe('role-aware help library', () => {
  const roles = ['platform_admin', 'org_admin', 'portfolio_manager', 'contributor', 'executive'];
  const searchMatrix = [
    ['platform_admin', 'configure Stripe safely', 15],
    ['org_admin', 'invite another council staff member', 6],
    ['portfolio_manager', 'mark a quarterly update included', 18],
    ['contributor', 'pre-reading question Review Pack', 25],
    ['executive', 'immutable report snapshot', 12],
  ];

  it('contains exactly 30 non-sensitive guidance entries for every current role', () => {
    roles.forEach((role) => {
      const help = getRoleHelp(role);
      expect(help.label).toBeTruthy();
      expect(help.faqs).toHaveLength(30);
      help.faqs.forEach((entry) => {
        expect(entry.question).toMatch(/\?$/);
        expect(entry.answer.length).toBeGreaterThan(40);
        expect(entry.answer.toLowerCase()).not.toContain(['github', 'pat_'].join('_'));
        expect(entry.answer.toLowerCase()).not.toContain('password:');
      });
    });
    expect(Object.keys(ROLE_HELP)).toHaveLength(5);
  });

  it('provides ten unique dashboard help links for every role', () => {
    roles.forEach((role) => {
      const help = getRoleHelp(role);
      const topHelp = getTopHelp(role);
      expect(topHelp).toHaveLength(10);
      expect(new Set(topHelp.map((entry) => entry.id)).size).toBe(10);
      expect(topHelp.every((entry) => help.faqs.some((faq) => faq.id === entry.id))).toBe(true);
    });
  });

  it('ranks a direct plain-language answer first for every role cohort', () => {
    searchMatrix.forEach(([role, query, expectedId]) => {
      const results = searchRoleHelp(role, query);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].id).toBe(expectedId);
    });
  });

  it('keeps a longer contextual question focused instead of returning incidental word matches', () => {
    const results = searchRoleHelp('org_admin', 'invite another council staff member');
    expect(results).toHaveLength(3);
    expect(results[0].id).toBe(6);
  });

  it('keeps returned guidance within the current role catalogue', () => {
    roles.forEach((role) => {
      const roleIds = new Set(getRoleHelp(role).faqs.map((entry) => entry.id));
      ['access', 'billing', 'report', 'support', 'collaboration'].forEach((query) => {
        searchRoleHelp(role, query).forEach((entry) => expect(roleIds.has(entry.id)).toBe(true));
      });
    });
    expect(searchRoleHelp('executive', 'configure Stripe safely').map((entry) => entry.question)).not.toContain('15. How do I configure Stripe safely?');
    expect(searchRoleHelp('contributor', 'Customer 360 Security trail')).toHaveLength(0);
  });

  it('falls back safely to executive guidance for an unknown role', () => {
    expect(getRoleHelp('unknown-role').label).toBe(getRoleHelp('executive').label);
  });

  it('removes source numbering where the interface supplies an accessible ordinal', () => {
    expect(questionLabel('10. How do I invite a colleague?')).toBe('How do I invite a colleague?');
  });
});
