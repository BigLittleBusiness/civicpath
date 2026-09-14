import jwt from 'jsonwebtoken';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import { User, AuditLog } from '../models/index.js';
import { env } from '../config/env.js';
import { decryptConfiguration, encryptConfiguration } from '../services/encryption.js';
import { createTotpSecret, createQrCode, verifyTotp, createRecoveryCodes, hashRecoveryCodes, consumeRecoveryCode } from '../services/mfa.js';

const loginSchema = Joi.object({ email: Joi.string().email().required(), password: Joi.string().min(8).required() });
const codeSchema = Joi.object({ code: Joi.string().trim().min(6).max(32).required() });
const stepUpSchema = Joi.object({ password: Joi.string().min(8).required(), code: Joi.string().trim().min(6).max(32).required() });

function sessionUser(user) {
  return { id: user.id, organizationId: user.organizationId, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, mfaEnabled: Boolean(user.mfaEnabled), mfaRequired: Boolean(user.mfaRequired) };
}

function cookieOptions() { return { httpOnly: true, secure: env.isProduction, sameSite: env.isProduction ? 'none' : 'lax', domain: env.cookieDomain, maxAge: 8 * 60 * 60 * 1000 }; }
function issueSession(res, user, elevatedAt = null) {
  const token = jwt.sign({ sub: user.id, organizationId: user.organizationId, role: user.role, elevatedAt }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
  res.cookie('civicpath_session', token, cookieOptions());
  res.clearCookie('civicpath_mfa_pending', cookieOptions());
}
function issueMfaPending(res, user, purpose) {
  const token = jwt.sign({ sub: user.id, organizationId: user.organizationId, role: user.role, scope: 'mfa_pending', purpose }, env.jwtSecret, { expiresIn: '10m' });
  res.cookie('civicpath_mfa_pending', token, cookieOptions());
}
async function audit(user, action, req, metadata = {}) {
  return AuditLog.create({ organizationId: user.organizationId, userId: user.id, entityType: 'authentication', entityId: user.id, action, metadata, ipAddress: req.ip }).catch(() => null);
}
async function verifyAuthenticator(user, code) {
  const secret = user.mfaSecretEncrypted ? decryptConfiguration(user.mfaSecretEncrypted).secret : null;
  if (secret && verifyTotp({ secret, code })) return { valid: true, usedRecovery: false };
  const recovery = await consumeRecoveryCode(code, user.mfaRecoveryCodes || []);
  if (recovery.valid) { await user.update({ mfaRecoveryCodes: recovery.remaining }); return { valid: true, usedRecovery: true }; }
  return { valid: false, usedRecovery: false };
}

export async function login(req, res, next) {
  try {
    const { value, error } = loginSchema.validate(req.body);
    if (error) return res.status(422).json({ error: error.message });
    const user = await User.findOne({ where: { email: value.email.toLowerCase(), status: 'active' } });
    if (!user || !(await bcrypt.compare(value.password, user.passwordHash))) {
      if (user) await audit(user, 'auth_login_failed', req, { reason: 'invalid_password' });
      return res.status(401).json({ error: 'Email or password is incorrect.' });
    }
    if (user.role === 'platform_admin') {
      if (!user.mfaEnabled) { issueMfaPending(res, user, 'setup'); return res.json({ data: { mfaRequired: true, setupRequired: true } }); }
      issueMfaPending(res, user, 'login');
      return res.json({ data: { mfaRequired: true, setupRequired: false } });
    }
    await user.update({ lastLoginAt: new Date() });
    await audit(user, 'auth_login_success', req);
    issueSession(res, user);
    return res.json({ data: { user: sessionUser(user) } });
  } catch (error) { return next(error); }
}

export async function beginMfaSetup(req, res, next) {
  try {
    if (req.auth.purpose !== 'setup') return res.status(403).json({ error: 'Authenticator setup is not available for this session.' });
    const user = await User.findByPk(req.auth.sub);
    if (!user || user.role !== 'platform_admin') return res.status(403).json({ error: 'System Administrator access is required.' });
    const secret = createTotpSecret({ issuer: env.mfaIssuer, accountName: user.email });
    await user.update({ mfaRequired: true, mfaEnabled: false, mfaSecretEncrypted: encryptConfiguration({ secret: secret.base32 }) });
    const qrCodeDataUrl = await createQrCode(secret.otpauth_url);
    return res.json({ data: { qrCodeDataUrl, manualKey: secret.base32, issuer: env.mfaIssuer, account: user.email } });
  } catch (error) { return next(error); }
}

export function mfaPending(req, res) {
  return res.json({ data: { purpose: req.auth.purpose } });
}

export async function confirmMfaSetup(req, res, next) {
  try {
    const { value, error } = codeSchema.validate(req.body);
    if (error) return res.status(422).json({ error: error.message });
    const user = await User.findByPk(req.auth.sub);
    const secret = user?.mfaSecretEncrypted ? decryptConfiguration(user.mfaSecretEncrypted).secret : null;
    if (!user || !secret || !verifyTotp({ secret, code: value.code })) return res.status(422).json({ error: 'That authenticator code could not be verified. Please try again.' });
    const recoveryCodes = createRecoveryCodes();
    await user.update({ mfaRequired: true, mfaEnabled: true, mfaRecoveryCodes: await hashRecoveryCodes(recoveryCodes), mfaEnrolledAt: new Date(), mfaLastVerifiedAt: new Date(), lastLoginAt: new Date() });
    await audit(user, 'mfa_enrolled', req);
    issueSession(res, user);
    return res.json({ data: { user: sessionUser(user), recoveryCodes } });
  } catch (error) { return next(error); }
}

export async function verifyMfaLogin(req, res, next) {
  try {
    const { value, error } = codeSchema.validate(req.body);
    if (error) return res.status(422).json({ error: error.message });
    const user = await User.findByPk(req.auth.sub);
    if (!user || !user.mfaEnabled || !(await verifyAuthenticator(user, value.code)).valid) {
      if (user) await audit(user, 'auth_mfa_failed', req);
      return res.status(401).json({ error: 'The authenticator or recovery code is not valid.' });
    }
    await user.update({ mfaLastVerifiedAt: new Date(), lastLoginAt: new Date() });
    await audit(user, 'auth_mfa_success', req);
    issueSession(res, user);
    return res.json({ data: { user: sessionUser(user) } });
  } catch (error) { return next(error); }
}

export async function stepUp(req, res, next) {
  try {
    const { value, error } = stepUpSchema.validate(req.body);
    if (error) return res.status(422).json({ error: error.message });
    const user = await User.findByPk(req.auth.sub);
    if (!user || user.role !== 'platform_admin' || !(await bcrypt.compare(value.password, user.passwordHash)) || !(await verifyAuthenticator(user, value.code)).valid) {
      if (user) await audit(user, 'privileged_reauth_failed', req);
      return res.status(401).json({ error: 'Password or authenticator code is not valid.' });
    }
    await user.update({ mfaLastVerifiedAt: new Date() });
    await audit(user, 'privileged_reauth_success', req);
    issueSession(res, user, Date.now());
    return res.json({ data: { elevatedUntil: new Date(Date.now() + env.privilegedActionMinutes * 60 * 1000).toISOString() } });
  } catch (error) { return next(error); }
}

export function logout(_req, res) {
  res.clearCookie('civicpath_session', cookieOptions());
  res.clearCookie('civicpath_mfa_pending', cookieOptions());
  return res.status(204).send();
}

export async function me(req, res, next) {
  try {
    const user = await User.findByPk(req.auth.sub);
    if (!user || user.status !== 'active') return res.status(401).json({ error: 'Your account is unavailable.' });
    return res.json({ data: { user: sessionUser(user) } });
  } catch (error) { return next(error); }
}
