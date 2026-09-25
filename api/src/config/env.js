import dotenv from 'dotenv';

dotenv.config();

const requiredInProduction = ['JWT_SECRET', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'FRONTEND_URL', 'PLATFORM_ENCRYPTION_KEY', 'ALTCHA_HMAC_SECRET'];

if (process.env.NODE_ENV === 'production') {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3015),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:3000').split(',').map((value) => value.trim()).filter(Boolean),
  cookieDomain: process.env.COOKIE_DOMAIN || undefined,
  jwtSecret: process.env.JWT_SECRET || 'development-only-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME || 'civicpath_dev',
    username: process.env.DB_USER || 'civicpath',
    password: process.env.DB_PASSWORD || '',
    ssl: process.env.DB_SSL === 'true',
  },
  demoMode: process.env.DEMO_MODE === 'true',
  platformEncryptionKey: process.env.PLATFORM_ENCRYPTION_KEY || '',
  altchaHmacSecret: process.env.ALTCHA_HMAC_SECRET || process.env.JWT_SECRET || 'development-altcha-secret-change-me',
  mfaIssuer: process.env.MFA_ISSUER || 'CivicPath',
  privilegedActionMinutes: Number(process.env.PRIVILEGED_ACTION_MINUTES || 10),
  awsRegion: process.env.AWS_REGION || '',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  supportAttachmentS3Bucket: process.env.SUPPORT_ATTACHMENT_S3_BUCKET || '',
  supportAttachmentLocalPath: process.env.SUPPORT_ATTACHMENT_LOCAL_PATH || (process.env.NODE_ENV === 'production' ? '/var/lib/civicpath/support-attachments' : '/tmp/civicpath-support-attachments'),
  isProduction: process.env.NODE_ENV === 'production',
});
