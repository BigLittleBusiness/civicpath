import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';

export function normalizeMfaCode(value = '') { return String(value).replace(/[^a-zA-Z0-9]/g, '').toUpperCase(); }

export function createTotpSecret({ issuer, accountName }) {
  return speakeasy.generateSecret({ length: 20, name: `${issuer}:${accountName}`, issuer });
}

export async function createQrCode(otpauthUrl) { return QRCode.toDataURL(otpauthUrl, { errorCorrectionLevel: 'M', margin: 1, width: 240 }); }

export function verifyTotp({ secret, code }) {
  return speakeasy.totp.verify({ secret, encoding: 'base32', token: normalizeMfaCode(code), window: 1 });
}

export function createRecoveryCodes() {
  return Array.from({ length: 8 }, () => crypto.randomBytes(5).toString('hex').toUpperCase().match(/.{1,5}/g).join('-'));
}

export async function hashRecoveryCodes(codes) { return Promise.all(codes.map((code) => bcrypt.hash(normalizeMfaCode(code), 12))); }

export async function consumeRecoveryCode(code, hashes = []) {
  const normalised = normalizeMfaCode(code);
  for (let index = 0; index < hashes.length; index += 1) {
    if (await bcrypt.compare(normalised, hashes[index])) return { valid: true, remaining: hashes.filter((_, itemIndex) => itemIndex !== index) };
  }
  return { valid: false, remaining: hashes };
}
