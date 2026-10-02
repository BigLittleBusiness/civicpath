import assert from 'node:assert/strict';
import test from 'node:test';
import { solveChallenge } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { sequelize } from '../src/config/database.js';
import { PublicFormChallenge } from '../src/models/index.js';
import { consumeAltchaPayload, issueAltchaChallenge } from '../src/services/altchaProtection.js';
import { contactEmailMessage, councilProofConfirmationMessage } from '../src/services/contactNotifications.js';
import { internalEmail, resultEmail } from '../src/services/pulseNotifications.js';

function encodedPayload(challenge, solution) {
  return Buffer.from(JSON.stringify({ challenge, solution })).toString('base64');
}

function assertQuartermarkEmail(message) {
  assert.match(message.html, /alt="CivicPath"/);
  assert.match(message.html, /https?:\/\/[^"']+\/civicpath-quartermark\.png/);
  assert.match(message.html, /#040404/);
  assert.match(message.html, /#163133/);
  assert.match(message.html, /#0D6A55/);
  assert.match(message.html, /#CD7C4E/);
}

test('ALTCHA issues a purpose-bound challenge and allows exactly one verified use', async () => {
  const req = { ip: '203.0.113.10', get: () => 'CivicPath contact test' };
  const challenge = await issueAltchaChallenge({ purpose: 'sales_enquiry', req });
  const solution = await solveChallenge({ challenge, deriveKey, timeout: 90_000 });
  assert.ok(solution, 'ALTCHA solved challenge should be available');
  const payload = encodedPayload(challenge, solution);
  const record = await sequelize.transaction((transaction) => consumeAltchaPayload({ encodedPayload: payload, purpose: 'sales_enquiry', transaction }));
  assert.ok(record?.consumedAt, 'A verified challenge should be marked as consumed');
  await assert.rejects(() => sequelize.transaction((transaction) => consumeAltchaPayload({ encodedPayload: payload, purpose: 'sales_enquiry', transaction })), /already been used|expired/);
  await PublicFormChallenge.destroy({ where: { signature: challenge.signature }, force: true });
});

test('contact notification subjects name the CivicPath platform and enquiry type', () => {
  const message = contactEmailMessage({ firstName: 'Taylor', lastName: 'Ng', email: 'taylor@example.gov.au', councilName: 'Example Council', role: 'Strategy', enquiryType: 'sales', message: 'Please share more information.' });
  assert.equal(message.subject, 'CivicPath - Sales enquiry');
  assert.match(message.text, /Example Council/);
  assertQuartermarkEmail(message);
});

test('Council Proof confirmation states the full $495 conversion-credit policy', () => {
  const message = councilProofConfirmationMessage({ firstName: 'Taylor', enquiryType: 'council_proof' });
  assert.equal(message.subject, 'CivicPath - Your Council Proof enquiry');
  assert.match(message.text, /full \$495 paid Council Proof fee is applied as a credit/);
  assert.match(message.text, /within 30 days of the final Council Proof review/);
  assert.match(message.html, /\$495 conversion credit/);
  assert.match(message.text, /does not create an invoice, payment obligation or subscription/);
  assertQuartermarkEmail(message);
});

test('support notification subjects include the selected support category', () => {
  const message = contactEmailMessage({ firstName: 'Taylor', lastName: 'Ng', email: 'taylor@example.gov.au', councilName: 'Example Council', role: 'Strategy', enquiryType: 'support', category: 'technical', message: 'The project form cannot be saved.' });
  assert.equal(message.subject, 'CivicPath - Support enquiry - Technical issue');
  assert.match(message.html, /Technical issue/);
  assertQuartermarkEmail(message);
});

test('Portfolio Readiness Pulse recipient and internal messages carry the Quartermark shell', () => {
  const lead = { firstName: 'Taylor', lastName: 'Ng', councilName: 'Example Council', role: 'Strategy', email: 'taylor@example.gov.au', stateRegion: 'NSW', country: 'Australia', decisionUseCase: 'Quarterly reporting' };
  const result = { bandLabel: 'Decision-ready foundation', portfolioVisibilityScore: 72, strategicConnectionScore: 68, decisionReadinessScore: 64, overallScore: 68, summary: 'A useful starting point for the next portfolio review.', actions: [{ title: 'Confirm portfolio owners', text: 'Create clear accountability for the priority initiatives.' }] };
  const recipient = resultEmail({ lead, result });
  const internal = internalEmail({ lead, result });
  assert.equal(recipient.subject, 'CivicPath - Your Portfolio Readiness Snapshot');
  assert.match(recipient.text, /Decision-ready foundation/);
  assertQuartermarkEmail(recipient);
  assert.equal(internal.subject, 'CivicPath - New Portfolio Readiness Pulse — Example Council');
  assert.match(internal.text, /Quarterly reporting/);
  assertQuartermarkEmail(internal);
});
