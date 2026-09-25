import assert from 'node:assert/strict';
import test from 'node:test';
import { SupportAttachmentError, supportAttachmentLimits, validateSupportAttachments } from '../src/services/supportAttachmentStorage.js';

function file({ name, type, bytes }) {
  const buffer = Buffer.from(bytes);
  return { originalname: name, mimetype: type, buffer, size: buffer.length };
}

test('accepts a supported PNG attachment with a valid file signature', () => {
  const png = file({ name: 'screen.png', type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] });
  assert.doesNotThrow(() => validateSupportAttachments([png]));
});

test('rejects attachment extension and MIME mismatches', () => {
  const renamedExecutable = file({ name: 'screen.png', type: 'image/png', bytes: [0x4d, 0x5a, 0x90, 0x00] });
  assert.throws(() => validateSupportAttachments([renamedExecutable]), SupportAttachmentError);
});

test('rejects more than the configured number of support attachments', () => {
  const text = file({ name: 'context.txt', type: 'text/plain', bytes: [0x68, 0x69] });
  assert.throws(() => validateSupportAttachments(Array.from({ length: supportAttachmentLimits.maxFiles + 1 }, () => text)), SupportAttachmentError);
});
