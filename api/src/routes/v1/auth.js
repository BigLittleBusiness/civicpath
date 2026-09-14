import { Router } from 'express';
import { login, logout, me, verifyMfaLogin, beginMfaSetup, confirmMfaSetup, stepUp, mfaPending } from '../../controllers/authController.js';
import { requireAuth, requireMfaPending } from '../../middleware/auth.js';

export const authRouter = Router();
authRouter.post('/login', login);
authRouter.get('/mfa/pending', requireMfaPending, mfaPending);
authRouter.post('/mfa/verify-login', requireMfaPending, verifyMfaLogin);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);
authRouter.post('/mfa/setup', requireMfaPending, beginMfaSetup);
authRouter.post('/mfa/setup/verify', requireMfaPending, confirmMfaSetup);
authRouter.post('/step-up', requireAuth, stepUp);
