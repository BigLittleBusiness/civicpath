import crypto from 'node:crypto';
import { env } from '../config/env.js';

function key() {
  if (!env.platformEncryptionKey) throw new Error('PLATFORM_ENCRYPTION_KEY must be configured before secret settings can be saved.');
  return crypto.createHash('sha256').update(env.platformEncryptionKey).digest();
}

export function encryptConfiguration(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return { algorithm: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

export function decryptConfiguration(payload) {
  if (!payload?.ciphertext) return {};
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
}

