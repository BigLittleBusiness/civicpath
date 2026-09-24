import crypto from 'node:crypto';
import { Op } from 'sequelize';
import { createChallenge, verifySolution } from 'altcha-lib';
import { deriveKey } from 'altcha-lib/algorithms/pbkdf2';
import { PublicFormChallenge } from '../models/index.js';
import { env } from '../config/env.js';

export const altchaPurposes = Object.freeze(['sales_enquiry', 'council_proof_enquiry', 'general_enquiry', 'portfolio_readiness_pulse', 'support_enquiry']);
const CHALLENGE_LIFETIME_MS = 5 * 60 * 1000;
const MAX_PAYLOAD_LENGTH = 16_000;

function purposeSecret(purpose, label) {
  return crypto.createHmac('sha256', env.altchaHmacSecret).update(`${purpose}:${label}`).digest('base64url');
}

function inputError(message) {
  const error = new Error(message);
  error.name = 'AltchaValidationError';
  return error;
}

function parsePayload(encodedPayload) {
  if (typeof encodedPayload !== 'string' || !encodedPayload || encodedPayload.length > MAX_PAYLOAD_LENGTH) throw inputError('Please complete the verification check before sending your enquiry.');
  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64').toString('utf8'));
    if (!payload?.challenge || !payload?.solution || !payload.challenge?.signature) throw new Error('Invalid payload');
    return payload;
  } catch {
    throw inputError('Please refresh the verification check and try again.');
  }
}

export async function issueAltchaChallenge({ purpose, req }) {
  if (!altchaPurposes.includes(purpose)) throw inputError('The requested verification check is not available.');
  const expiresAt = new Date(Date.now() + CHALLENGE_LIFETIME_MS);
  const challenge = await createChallenge({
    algorithm: 'PBKDF2/SHA-256',
    // Deliberately modest for a five-minute council form: ALTCHA is paired with single-use records,
    // honeypots and rate limits, rather than relying on an expensive client-side computation alone.
    cost: 200,
    counter: crypto.randomInt(100, 250),
    deriveKey,
    expiresAt,
    data: { purpose },
    hmacSignatureSecret: purposeSecret(purpose, 'challenge'),
    hmacKeySignatureSecret: purposeSecret(purpose, 'key'),
  });
  await PublicFormChallenge.create({
    purpose,
    signature: challenge.signature,
    expiresAt,
    ipHash: fingerprint(req, req.ip),
  });
  return challenge;
}

export async function consumeAltchaPayload({ encodedPayload, purpose, transaction }) {
  if (!altchaPurposes.includes(purpose)) throw inputError('The requested verification check is not available.');
  const payload = parsePayload(encodedPayload);
  const challengePurpose = payload.challenge?.parameters?.data?.purpose;
  if (challengePurpose !== purpose) throw inputError('Please complete the verification check for this form.');
  const verification = await verifySolution({
    challenge: payload.challenge,
    solution: payload.solution,
    deriveKey,
    hmacSignatureSecret: purposeSecret(purpose, 'challenge'),
    hmacKeySignatureSecret: purposeSecret(purpose, 'key'),
  });
  if (!verification.verified) throw inputError('The verification check expired or could not be confirmed. Please try again.');
  const [consumed] = await PublicFormChallenge.update({ consumedAt: new Date() }, { where: { purpose, signature: payload.challenge.signature, consumedAt: null, expiresAt: { [Op.gt]: new Date() } }, transaction });
  if (!consumed) throw inputError('The verification check has expired or has already been used. Please complete it again.');
  return PublicFormChallenge.findOne({ where: { purpose, signature: payload.challenge.signature }, transaction });
}

export function fingerprint(req, value) {
  if (!value) return null;
  return crypto.createHash('sha256').update(`${env.altchaHmacSecret}:${value}`).digest('hex');
}

export { inputError as altchaInputError };
