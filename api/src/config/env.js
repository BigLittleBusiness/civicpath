import dotenv from 'dotenv';

dotenv.config();

const requiredInProduction = ['JWT_SECRET', 'DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD', 'FRONTEND_URL', 'PLATFORM_ENCRYPTION_KEY'];

if (process.env.NODE_ENV === 'production') {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length) throw new Error(`Missing required production environment variables: ${missing.join(', ')}`);
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3015),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
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
  mfaIssuer: process.env.MFA_ISSUER || 'CivicPath',
  privilegedActionMinutes: Number(process.env.PRIVILEGED_ACTION_MINUTES || 10),
  isProduction: process.env.NODE_ENV === 'production',
});
