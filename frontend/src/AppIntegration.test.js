import React from 'react';
import { render, screen } from '@testing-library/react';
import { Workspace } from './App';
import { useAuth } from './features/AuthContext';
import { NotificationDeliveryPanel, deliveryOutcomeLabel } from './components/NotificationDeliveryPanel';
import { api } from './lib/api';
import { invitationDeliveryMessage } from './components/PeopleAccessPanel';
jest.mock('./features/AuthContext', () => ({ useAuth: jest.fn(), AuthProvider: ({ children }) => children }));
jest.mock('./lib/api', () => ({ api: { get: jest.fn() } }));
jest.mock('react-router-dom', () => ({ Navigate: ({ to }) => <p>Redirect {to}</p>, BrowserRouter: ({ children }) => children, Route: () => null, Routes: () => null, useLocation: () => ({ pathname: '/dashboard' }), NavLink: ({ children }) => <span>{children}</span> }));
jest.mock('./components/AppShell', () => ({ AppShell: ({ children }) => <div>{children}</div> }));
jest.mock('./components/AccessibilityAids', () => ({ RouteAnnouncer: () => null }));
jest.mock('./components/SubscriptionPanel', () => ({ SubscriptionPanel: () => <p>Council subscription recovery</p> }));
jest.mock('./components/TenantDataPanel', () => ({ TenantDataPanel: () => <p>Tenant data recovery</p> }));
jest.mock('react-hot-toast', () => ({ Toaster: () => null }));
beforeEach(() => jest.clearAllMocks());
test.each(['org_admin', 'portfolio_manager', 'contributor', 'executive'])('%s accesses active Council routes and cannot enter platform operations', (role) => {
  useAuth.mockReturnValue({ state: 'authenticated', user: { role, status: 'active', organisationStatus: 'active', accessActive: true } });
  const { unmount } = render(<Workspace><p>Authorised Council page</p></Workspace>); expect(screen.getByText('Authorised Council page')).toBeTruthy(); unmount();
  render(<Workspace platformOnly><p>Privileged operations</p></Workspace>); expect(screen.getByText('Redirect /dashboard')).toBeTruthy(); expect(screen.queryByText('Privileged operations')).toBeNull();
});
test('operations-only platform accessActive false redirects to /admin rather than Council billing', () => {
  useAuth.mockReturnValue({ state: 'authenticated', user: { role: 'platform_admin', accessActive: false, operationsOnly: true, organisationStatus: 'suspended' } });
  const { unmount } = render(<Workspace><p>Council APIs</p></Workspace>); expect(screen.getByText('Redirect /admin')).toBeTruthy(); expect(screen.queryByText('Council subscription recovery')).toBeNull(); unmount();
  render(<Workspace platformOnly><p>Platform operations</p></Workspace>); expect(screen.getByText('Platform operations')).toBeTruthy(); expect(screen.queryByText('Tenant data recovery')).toBeNull();
});
test.each(['org_admin', 'portfolio_manager', 'contributor', 'executive'])('ended %s stays authenticated but gets only permitted recovery', (role) => {
  useAuth.mockReturnValue({ state: 'authenticated', user: { role, status: 'active', organisationStatus: 'active', accessActive: false } }); render(<Workspace><p>Active register</p></Workspace>);
  expect(screen.getByText('Council subscription recovery')).toBeTruthy(); expect(!!screen.queryByText('Tenant data recovery')).toBe(role === 'org_admin'); expect(screen.queryByText('Active register')).toBeNull();
});
test('suspension blocks billing and export recovery even with an active subscription', () => {
  useAuth.mockReturnValue({ state: 'authenticated', user: { role: 'org_admin', status: 'active', organisationStatus: 'suspended', accessActive: true } }); render(<Workspace><p>Active register</p></Workspace>);
  expect(screen.getByText('Workspace access unavailable')).toBeTruthy(); expect(screen.queryByText('Council subscription recovery')).toBeNull(); expect(screen.queryByText('Tenant data recovery')).toBeNull();
});
test.each(['anonymous', 'mfa_pending'])('%s cannot mount authenticated data panels', (state) => {
  useAuth.mockReturnValue({ state, user: null }); render(<Workspace><p>Private data</p></Workspace>); expect(screen.queryByText('Private data')).toBeNull(); expect(screen.getByText(`Redirect ${state === 'mfa_pending' ? '/mfa' : '/login'}`)).toBeTruthy();
});
test('platform message page requests no Council notification monitor and offers no replay', () => {
  useAuth.mockReturnValue({ user: { role: 'platform_admin', operationsOnly: true } }); render(<NotificationDeliveryPanel/>); expect(api.get).not.toHaveBeenCalled(); expect(screen.queryByRole('button')).toBeNull(); expect(screen.getByText(/does not certify provider configuration/)).toBeTruthy();
});
test('invitation and legacy sent wording means accepted not delivered; failures require regeneration', () => {
  expect(invitationDeliveryMessage('accepted')).toMatch(/inbox delivery is not confirmed/);
  ['disabled', 'failed', 'uncertain'].forEach((status) => expect(invitationDeliveryMessage(status)).toMatch(/Regenerate|regeneration/));
  expect(deliveryOutcomeLabel('sent')).toMatch(/Provider accepted/);
});
