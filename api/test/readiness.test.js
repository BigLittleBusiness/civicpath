import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateReadinessScore, readinessBand } from '../src/utils/readiness.js';

test('calculates a 100-point readiness score from six equal dimensions', () => {
  assert.equal(calculateReadinessScore({ scopeScore: 5, costScore: 5, approvalsScore: 5, partnerScore: 5, fundingScore: 5, deliveryScore: 5 }), 100);
  assert.equal(calculateReadinessScore({ scopeScore: 3, costScore: 3, approvalsScore: 3, partnerScore: 3, fundingScore: 3, deliveryScore: 3 }), 60);
});

test('uses stable portfolio readiness bands', () => {
  assert.equal(readinessBand(75), 'funding_ready');
  assert.equal(readinessBand(74), 'in_development');
  assert.equal(readinessBand(49), 'early_stage');
});

