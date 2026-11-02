import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import HelpGuidancePage from './HelpGuidancePage';

jest.mock('react-router-dom', () => ({
  Link: ({ children, to, ...props }) => <a href={to} {...props}>{children}</a>,
  useLocation: () => ({ search: '' }),
}));

jest.mock('../features/AuthContext', () => ({
  useAuth: () => ({ user: { role: 'org_admin' } }),
}));

describe('HelpGuidancePage', () => {
  it('shows the 30 Organisation Administrator answers and ranks a direct contextual answer first', () => {
    const { container } = render(<HelpGuidancePage/>);
    const resultSummary = (value) => screen.getByText((_content, node) => node?.tagName === 'P' && node.textContent === value);

    expect(screen.getByText('Your CivicPath guide')).toBeTruthy();
    expect(screen.getByText('Organisation Administrator')).toBeTruthy();
    expect(resultSummary('30 answers available for your role')).toBeTruthy();
    expect(screen.getByText('How do I invite another council staff member?')).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Search role-specific help' }), { target: { value: 'invite colleague' } });

    expect(screen.getByText(/answers match your search/)).toBeTruthy();
    expect(screen.getByText('How do I invite another council staff member?')).toBeTruthy();
    expect(container.querySelector('.faq-entry h3')?.textContent).toBe('How do I invite another council staff member?');
    expect(screen.queryByText('How do I update payment details or download invoices?')).toBeNull();
  });
});
