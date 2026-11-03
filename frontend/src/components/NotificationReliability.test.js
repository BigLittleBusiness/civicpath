import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { NotificationPreferencesPanel, notificationDefaults } from './NotificationPreferencesPanel';
import { NotificationInboxPanel } from './NotificationInboxPanel';
import { ReliableNotificationDeliveryPanel } from './ReliableNotificationDeliveryPanel';
const policy = { emailEnabled: false, digestsEnabled: true, remindersEnabled: true };
const preferenceClient = (canEdit = true) => ({ get: jest.fn().mockResolvedValue({ data: { data: { preferences: notificationDefaults, policy, canEdit, providerConfigured: false } } }), put: jest.fn().mockResolvedValue({ data: { data: {} } }) });
afterEach(cleanup);
test('preferences default email off, explain disabled delivery, and persist explicit opt-in', async () => {
  const client = preferenceClient(); render(<NotificationPreferencesPanel role="contributor" client={client}/>);
  const checkbox = await screen.findByRole('checkbox', { name: /I opt in/i }); expect(checkbox.checked).toBe(false);
  expect(screen.getByText(/Email delivery is not configured/)).toBeTruthy();
  fireEvent.click(checkbox); fireEvent.click(screen.getByRole('button', { name: 'Save my preferences' }));
  await waitFor(() => expect(client.put).toHaveBeenCalledWith('/notifications/preferences', { ...notificationDefaults, emailEnabled: true }));
  expect(await screen.findByRole('status')).toBeTruthy();
});
test('executive preferences are read-only; org administrator gets separate policy controls', async () => {
  const client = preferenceClient(false); render(<NotificationPreferencesPanel role="executive" client={client}/>);
  await screen.findByText(/read-only access/); expect(screen.getByRole('button', { name: 'Save my preferences' }).closest('fieldset').disabled).toBe(true);
  expect(screen.queryByRole('button', { name: 'Save organisation policy' })).toBeNull(); cleanup();
  render(<NotificationPreferencesPanel role="org_admin" client={preferenceClient()}/>); expect(await screen.findByRole('button', { name: 'Save organisation policy' })).toBeTruthy();
});
test('preferences load failures have an actionable retry and do not display opt-in controls', async () => {
  render(<NotificationPreferencesPanel role="contributor" client={{ get: jest.fn().mockRejectedValue(Error('private server detail')) }}/>);
  expect(await screen.findByRole('alert')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Retry loading preferences' })).toBeTruthy(); expect(screen.queryByRole('checkbox')).toBeNull();
});
const item = { id: 'notification', title: 'Collaboration updates are available', text: 'Sign in to review current updates.', createdAt: '2026-11-03T12:00:00Z', readAt: null };
test('inbox shows current notifications and marks read via tenant-scoped route', async () => {
  const client = { get: jest.fn().mockResolvedValue({ data: { data: { items: [item], nextCursor: null } } }), patch: jest.fn().mockResolvedValue({ data: { data: { id: item.id, readAt: '2026-11-03T13:00:00Z' } } }) };
  render(<NotificationInboxPanel role="contributor" client={client}/>); const button = await screen.findByRole('button', { name: /Mark Collaboration/ }); fireEvent.click(button);
  await waitFor(() => expect(client.patch).toHaveBeenCalledWith('/notifications/inbox/notification/read', {}));
  expect(await screen.findByText('Notification marked as read.')).toBeTruthy(); expect(screen.queryByRole('button', { name: /Mark Collaboration/ })).toBeNull();
});
test('executive cannot mark inbox read; content renders as text, never raw HTML', async () => {
  const client = { get: jest.fn().mockResolvedValue({ data: { data: { items: [{ ...item, title: '<img src=x onerror=alert(1)>' }], nextCursor: null } } }) };
  render(<NotificationInboxPanel role="executive" client={client}/>); expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeTruthy(); expect(screen.queryByRole('img')).toBeNull(); expect(screen.queryByRole('button', { name: /Mark/ })).toBeNull();
});
test('inbox supports pagination, deduplicates and exposes empty/error states', async () => {
  const client = { get: jest.fn().mockResolvedValueOnce({ data: { data: { items: [item], nextCursor: 'cursor' } } }).mockResolvedValueOnce({ data: { data: { items: [item, { ...item, id: 'two', title: 'Review your requests' }], nextCursor: null } } }) };
  render(<NotificationInboxPanel role="contributor" client={client}/>); fireEvent.click(await screen.findByRole('button', { name: 'Load more notifications' })); await screen.findByText('Review your requests'); expect(screen.getAllByRole('article')).toHaveLength(2); cleanup();
  render(<NotificationInboxPanel client={{ get: jest.fn().mockResolvedValue({ data: { data: { items: [], nextCursor: null } } }) }}/>); expect(await screen.findByText(/No current notifications/)).toBeTruthy(); cleanup();
  render(<NotificationInboxPanel client={{ get: jest.fn().mockRejectedValue(Error('private')) }}/>); expect(await screen.findByRole('alert')).toBeTruthy(); expect(screen.getByRole('button', { name: 'Retry inbox' })).toBeTruthy();
});
test('delivery visibility distinguishes accepted from delivered and explains no replay', async () => {
  render(<ReliableNotificationDeliveryPanel client={{ get: jest.fn().mockResolvedValue({ data: { data: [{ id: 'one', category: 'password_reset', status: 'accepted', attempt: 1 }] } }) }}/>);
  expect(await screen.findByText(/accepted · Attempt 1/)).toBeTruthy(); expect(screen.getByText(/Accepted means SES accepted a message/)).toBeTruthy(); expect(screen.getByText(/never automatically replayed/)).toBeTruthy();
});
