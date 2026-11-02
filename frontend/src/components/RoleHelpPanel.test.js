import React from 'react';
import { render, screen } from '@testing-library/react';
import { ContextualHelpLink, TopHelpPanel } from './RoleHelpPanel';

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
}));

describe('RoleHelpPanel', () => {
  const roles = ['platform_admin', 'org_admin', 'portfolio_manager', 'contributor', 'executive'];

  it('renders exactly ten in-role destination links for every cohort', () => {
    roles.forEach((role) => {
      const { unmount } = render(<TopHelpPanel role={role}/>);
      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(11);
      expect(links.slice(1).every((link) => link.getAttribute('href')?.startsWith('/help?q='))).toBe(true);
      unmount();
    });
  });

  it('encodes contextual topics into the authenticated Help route', () => {
    render(<ContextualHelpLink topic="invite a colleague & assign a role" label="Access help"/>);
    const link = screen.getByRole('link', { name: /access help/i });
    expect(link.getAttribute('href')).toBe('/help?q=invite%20a%20colleague%20%26%20assign%20a%20role');
  });
});
