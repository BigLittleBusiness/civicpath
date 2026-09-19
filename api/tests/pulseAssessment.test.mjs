import test from 'node:test';
import assert from 'node:assert/strict';
import { calculatePulseResult } from '../src/services/pulseAssessment.js';

const lowReadiness = {
  portfolioFocus: ['economic_growth'],
  portfolioVisibilityLocation: 'separate_spreadsheets',
  portfolioInformationConsistency: 'some',
  strategicConnection: 'clear_for_some',
  decisionComparison: 'case_by_case',
  readinessOwnerNextAction: 'a_few',
  evidenceVisibility: 'mostly_known_informally',
  constraintActioning: 'discussed_informally',
  constraintThemes: ['evidence_data', 'funding_pathway'],
};

test('Pulse scoring produces a deterministic result and prioritises the lowest dimensions', () => {
  const result = calculatePulseResult(lowReadiness);
  assert.equal(result.scoreVersion, '1.0.0');
  assert.equal(result.portfolioVisibilityScore, 50);
  assert.equal(result.strategicConnectionScore, 40);
  assert.equal(result.decisionReadinessScore, 25);
  assert.equal(result.overallScore, 38);
  assert.equal(result.bandCode, 'baseline_needed');
  assert.equal(result.actions[0].title, 'Clarify the next move');
  assert.equal(result.actions[1].title, 'Make the decision link visible');
  assert.equal(result.actions[2].title, 'Make evidence needs explicit');
});

test('Pulse scoring recognises a consistent, decision-ready working view', () => {
  const result = calculatePulseResult({
    portfolioFocus: ['economic_growth'],
    portfolioVisibilityLocation: 'single_shared_view',
    portfolioInformationConsistency: 'all_or_almost_all',
    strategicConnection: 'clear_and_recorded',
    decisionComparison: 'easy_consistent_comparison',
    readinessOwnerNextAction: 'almost_all',
    evidenceVisibility: 'visible_and_reviewed',
    constraintActioning: 'owner_action_due_date',
    constraintThemes: ['partner_alignment'],
  });
  assert.equal(result.overallScore, 100);
  assert.equal(result.bandCode, 'consistency_to_scale');
  assert.equal(result.actions.length, 3);
  assert.equal(result.actions[2].title, 'Make partnership work visible');
});
