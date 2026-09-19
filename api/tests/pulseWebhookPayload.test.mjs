import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCrmWebhookPayload } from '../src/services/pulseNotifications.js';

test('CRM payload retains the consent boundary and deterministic result', () => {
  const payload = buildCrmWebhookPayload({
    notificationId: 'feeac00c-1234-4d33-8a2c-90c259cb4920',
    lead: { id: '0b68f781-1a2f-4218-a7e2-bf37327b9d9c', firstName: 'Avery', lastName: 'Ngata', email: 'avery@example.govt.nz', councilName: 'Example Regional Council', country: 'NZ', stateRegion: 'Waikato', role: 'economic_development', roleOther: null, lifecycleStatus: 'new', decisionUseCase: 'executive_briefing', decisionUseCaseOther: null },
    session: { sessionId: '82e7dfa5-f159-4985-9f24-c16cba00f4da', assessmentVersion: '1.0.0', completedAt: new Date('2026-09-19T12:00:00.000Z'), responses: { portfolioFocus: ['economic_growth'], constraintThemes: ['evidence_data'] } },
    result: { scoreVersion: '1.0.0', portfolioVisibilityScore: 50, strategicConnectionScore: 40, decisionReadinessScore: 25, overallScore: 38, bandCode: 'baseline_needed', bandLabel: 'Establish a shared baseline', actions: [{ title: 'Clarify the next move', text: 'Add a clear owner.' }] },
    consents: [{ consentType: 'resource_request', granted: true, policyVersion: 'pulse-privacy-1.0' }, { consentType: 'marketing_updates', granted: false, policyVersion: 'pulse-privacy-1.0' }],
  });
  assert.equal(payload.schema_version, 'civicpath.public_lead.v1');
  assert.equal(payload.event, 'public_lead.captured');
  assert.equal(payload.event_id, 'feeac00c-1234-4d33-8a2c-90c259cb4920');
  assert.equal(payload.lead.council_name, 'Example Regional Council');
  assert.equal(payload.pulse.scores.overall, 38);
  assert.equal(payload.consent.resource_request, true);
  assert.equal(payload.consent.marketing_updates, false);
  assert.equal(payload.consent.policy_version, 'pulse-privacy-1.0');
});
