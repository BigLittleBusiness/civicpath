import jwt from 'jsonwebtoken';
import Joi from 'joi';
import bcrypt from 'bcryptjs';
import { User, AuditLog, Organization, ProductPlan, Subscription } from '../models/index.js';
import { env } from '../config/env.js';
import { decryptConfiguration, encryptConfiguration } from '../services/encryption.js';
import { createTotpSecret, buildOtpauthUrl, createQrCode, verifyTotp, createRecoveryCodes, hashRecoveryCodes, consumeRecoveryCode } from '../services/mfa.js';
import { createTenantAuthController } from '../services/tenantAuthController.js';

const controller = createTenantAuthController({
  jwt, Joi, bcrypt, User, AuditLog, Organization, ProductPlan, Subscription, env,
  decryptConfiguration, encryptConfiguration, createTotpSecret, buildOtpauthUrl,
  createQrCode, verifyTotp, createRecoveryCodes, hashRecoveryCodes, consumeRecoveryCode,
});

export const { login, beginMfaSetup, mfaPending, confirmMfaSetup, verifyMfaLogin, stepUp, logout, me } = controller;
export { createTenantAuthController } from '../services/tenantAuthController.js';
