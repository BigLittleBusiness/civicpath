import crypto from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { GetObjectCommand, PutObjectCommand, S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env.js';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILES = 3;
const localRoot = path.resolve(env.supportAttachmentLocalPath);
const allowedMimeTypes = new Map([
  ['image/png', ['png']],
  ['image/jpeg', ['jpg', 'jpeg']],
  ['image/webp', ['webp']],
  ['application/pdf', ['pdf']],
  ['text/plain', ['txt']],
  ['application/msword', ['doc']],
  ['application/vnd.ms-excel', ['xls']],
  ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', ['docx']],
  ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ['xlsx']],
]);

export class SupportAttachmentError extends Error {
  constructor(message, status = 422) {
    super(message);
    this.name = 'SupportAttachmentError';
    this.status = status;
  }
}

function extensionFor(filename = '') {
  return path.extname(filename).toLowerCase().replace('.', '');
}

function safeFilename(filename = '') {
  const extension = extensionFor(filename);
  const stem = path.basename(filename, path.extname(filename))
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'attachment';
  return `${stem}${extension ? `.${extension}` : ''}`.slice(0, 180);
}

function assertSupportedFile(file) {
  if (!file?.buffer?.length) throw new SupportAttachmentError('Each attachment must contain a file.');
  if (file.size > MAX_FILE_BYTES) throw new SupportAttachmentError('Attachments must be 10 MB or smaller.');
  const extension = extensionFor(file.originalname);
  const permittedExtensions = allowedMimeTypes.get(file.mimetype);
  if (!permittedExtensions || !permittedExtensions.includes(extension)) {
    throw new SupportAttachmentError('Attachments must be a PNG, JPEG, WebP, PDF, TXT, Word or Excel file.');
  }
}

function assertSignatures(file) {
  const header = file.buffer.subarray(0, 8);
  const starts = (...bytes) => bytes.every((byte, index) => header[index] === byte);
  if (file.mimetype === 'image/png' && !starts(0x89, 0x50, 0x4e, 0x47)) throw new SupportAttachmentError('The PNG attachment content could not be verified.');
  if (file.mimetype === 'image/jpeg' && !starts(0xff, 0xd8, 0xff)) throw new SupportAttachmentError('The JPEG attachment content could not be verified.');
  if (file.mimetype === 'image/webp' && !(file.buffer.subarray(0, 4).toString('ascii') === 'RIFF' && file.buffer.subarray(8, 12).toString('ascii') === 'WEBP')) throw new SupportAttachmentError('The WebP attachment content could not be verified.');
  if (file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') throw new SupportAttachmentError('The PDF attachment content could not be verified.');
  if (file.mimetype.includes('openxmlformats') && !starts(0x50, 0x4b, 0x03, 0x04)) throw new SupportAttachmentError('The Office attachment content could not be verified.');
  if (['application/msword', 'application/vnd.ms-excel'].includes(file.mimetype) && !starts(0xd0, 0xcf, 0x11, 0xe0)) throw new SupportAttachmentError('The legacy Office attachment content could not be verified.');
}

function s3Client() {
  return new S3Client({
    region: env.awsRegion,
    credentials: { accessKeyId: env.awsAccessKeyId, secretAccessKey: env.awsSecretAccessKey },
  });
}

function usingS3() {
  return Boolean(env.supportAttachmentS3Bucket && env.awsRegion && env.awsAccessKeyId && env.awsSecretAccessKey);
}

function assertStorageAvailable() {
  if (env.isProduction && !usingS3()) {
    throw new SupportAttachmentError('Support attachments are unavailable until private AWS S3 storage is configured.', 503);
  }
}

export function validateSupportAttachments(files = []) {
  if (files.length > MAX_FILES) throw new SupportAttachmentError(`Attach up to ${MAX_FILES} files per support enquiry.`);
  for (const file of files) {
    assertSupportedFile(file);
    assertSignatures(file);
  }
}

export async function storeSupportAttachment({ attachmentId, organizationId, supportCaseId, file }) {
  assertStorageAvailable();
  assertSupportedFile(file);
  assertSignatures(file);
  const originalFilename = safeFilename(file.originalname);
  const extension = extensionFor(originalFilename);
  const storageKey = `support/${organizationId}/${supportCaseId}/${attachmentId}${extension ? `.${extension}` : ''}`;
  const checksumSha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');

  if (usingS3()) {
    await s3Client().send(new PutObjectCommand({
      Bucket: env.supportAttachmentS3Bucket,
      Key: storageKey,
      Body: file.buffer,
      ContentType: file.mimetype,
      ContentDisposition: `attachment; filename="${originalFilename.replace(/"/g, '')}"`,
      ServerSideEncryption: 'AES256',
      Metadata: { civicpathscope: 'support_attachment', checksumsha256: checksumSha256 },
    }));
    return { storageProvider: 's3', storageKey, originalFilename, contentType: file.mimetype, sizeBytes: file.size, checksumSha256 };
  }

  const localPath = path.join(localRoot, storageKey);
  await fs.mkdir(path.dirname(localPath), { recursive: true, mode: 0o700 });
  await fs.writeFile(localPath, file.buffer, { mode: 0o600 });
  return { storageProvider: 'local', storageKey, originalFilename, contentType: file.mimetype, sizeBytes: file.size, checksumSha256 };
}

export async function removeSupportAttachment({ storageProvider, storageKey }) {
  if (!storageKey) return;
  if (storageProvider === 's3' && usingS3()) {
    await s3Client().send(new DeleteObjectCommand({ Bucket: env.supportAttachmentS3Bucket, Key: storageKey })).catch(() => null);
    return;
  }
  const localPath = path.resolve(localRoot, storageKey);
  if (localPath.startsWith(`${localRoot}${path.sep}`)) await fs.unlink(localPath).catch(() => null);
}

export async function readSupportAttachment(attachment) {
  if (attachment.storageProvider === 's3') {
    if (!usingS3()) throw new SupportAttachmentError('The private file store is unavailable.', 503);
    const response = await s3Client().send(new GetObjectCommand({ Bucket: env.supportAttachmentS3Bucket, Key: attachment.storageKey }));
    if (!response.Body) throw new SupportAttachmentError('The attachment could not be read.', 404);
    return response.Body;
  }
  const localPath = path.resolve(localRoot, attachment.storageKey);
  if (!localPath.startsWith(`${localRoot}${path.sep}`)) throw new SupportAttachmentError('The attachment path is invalid.', 404);
  try { return await fs.readFile(localPath); }
  catch { throw new SupportAttachmentError('The attachment could not be found.', 404); }
}

export const supportAttachmentLimits = Object.freeze({ maxFiles: MAX_FILES, maxFileBytes: MAX_FILE_BYTES });
