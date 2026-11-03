import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContributionRequestControls, DependencyHandoverControls, QuarterlyUpdateWorkflow, QuarterlyNarrativeEditor, SafeOutcomeLink } from './ReviewWorkflowPanel';
import { api } from '../lib/api';
import { useAuth } from '../features/AuthContext';
jest.mock('../lib/api', () => ({ api: { post: jest.fn(), patch: jest.fn(), get: jest.fn() } }));
jest.mock('../features/AuthContext', () => ({ useAuth: jest.fn() }));
const id = '123e4567-e89b-12d3-a456-426614174000';
const update = { id, actionId: id, reportingPeriodId: id, submittedBy: 'author', version: 4, workflowStatus: 'submitted_for_review', reviewRequestedFromUserId: 'reviewer', status: 'on_track', achievements: 'Original narrative' };
beforeEach(() => { jest.clearAllMocks(); useAuth.mockReturnValue({ user: { id: 'reviewer', role: 'contributor' } }); });
test('assigned reviewer sends expected version when endorsing', async () => {
  api.patch.mockResolvedValue({ data: {} });
  render(<QuarterlyUpdateWorkflow update={update}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Endorse narrative' }));
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(`/quarterly-action-updates/${id}/workflow`, { expectedVersion: 4, workflowStatus: 'endorsed', reviewComment: null }));
});
test('executive sees content but no write controls', () => {
  useAuth.mockReturnValue({ user: { id: 'reviewer', role: 'executive' } });
  render(<><QuarterlyUpdateWorkflow update={update}/><DependencyHandoverControls dependency={{ id, handoverStatus: 'requested', handoverRequestedTo: 'reviewer' }}/><ContributionRequestControls request={{ id, status: 'open', requestedFromUserId: 'reviewer' }}/></>);
  expect(screen.getByText('Original narrative')).toBeTruthy(); expect(screen.queryAllByRole('button')).toHaveLength(0);
});
test('author manager cannot self-endorse; unrelated contributor cannot review', () => {
  useAuth.mockReturnValue({ user: { id: 'author', role: 'org_admin' } });
  const { unmount } = render(<QuarterlyUpdateWorkflow update={update}/>);
  expect(screen.queryByRole('button', { name: 'Endorse narrative' })).toBeNull(); unmount();
  useAuth.mockReturnValue({ user: { id: 'stranger', role: 'contributor' } });
  render(<QuarterlyUpdateWorkflow update={update}/>);
  expect(screen.queryByRole('button', { name: 'Endorse narrative' })).toBeNull();
});
test('endorsed narrative exposes include only to managers', () => {
  const endorsed = { ...update, workflowStatus: 'endorsed' };
  const { unmount } = render(<QuarterlyUpdateWorkflow update={endorsed}/>);
  expect(screen.queryByRole('button', { name: 'Include in report' })).toBeNull(); unmount();
  useAuth.mockReturnValue({ user: { id: 'manager', role: 'portfolio_manager' } });
  render(<QuarterlyUpdateWorkflow update={endorsed}/>);
  expect(screen.getByRole('button', { name: 'Include in report' })).toBeTruthy();
});
test('narrative conflict retains text and sends initial expected version', async () => {
  useAuth.mockReturnValue({ user: { id: 'author', role: 'contributor' } });
  api.post.mockRejectedValue({ response: { status: 409, data: { error: 'Another writer changed this update.' } } });
  render(<QuarterlyNarrativeEditor action={{ id, ownerId: 'author', status: 'on_track' }} update={update} periodId={id}/>);
  fireEvent.change(screen.getByLabelText(/achievements/i), { target: { value: 'My unsaved text' } });
  fireEvent.click(screen.getByRole('button', { name: /save narrative/i }));
  await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/retained/));
  expect(screen.getByLabelText(/achievements/i).value).toBe('My unsaved text');
  expect(api.post.mock.calls[0][1].expectedVersion).toBe(4);
});
test('request recipient submits then requester accepts; no direct recipient acceptance', () => {
  const request = { id, status: 'open', requestedFromUserId: 'reviewer', requestedByUserId: 'author' };
  render(<ContributionRequestControls request={request}/>);
  expect(screen.getByRole('button', { name: 'Submit response' })).toBeTruthy(); expect(screen.queryByRole('button', { name: 'Accept response' })).toBeNull();
});
test('outcome links use fixed authenticated route and validated source ids only', () => {
  const { unmount } = render(<SafeOutcomeLink item={{ resourceType: 'action', resourceId: 'javascript:alert(1)', sourcePreview: { id: 'javascript:alert(1)' } }}/>);
  expect(screen.queryByRole('link')).toBeNull(); unmount();
  render(<SafeOutcomeLink item={{ resourceType: 'action', resourceId: id, sourcePreview: { id } }}/>);
  expect(screen.getByRole('link').getAttribute('href')).toBe(`/strategy-delivery?actionId=${id}`);
});
