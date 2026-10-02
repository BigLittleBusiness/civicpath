import { Router } from 'express';
import { login, logout, me, verifyMfaLogin, beginMfaSetup, confirmMfaSetup, stepUp, mfaPending } from '../../controllers/authController.js';
import { getAccountChallenge, registerAndStartCheckout, requestPasswordReset, resetPassword } from '../../controllers/accountLifecycleController.js';
import { requireAuth, requireMfaPending } from '../../middleware/auth.js';

export const authRouter = Router();
authRouter.get('/account-challenge', getAccountChallenge);
authRouter.post('/register', registerAndStartCheckout);
authRouter.post('/password-reset/request', requestPasswordReset);
authRouter.post('/password-reset/confirm', resetPassword);
authRouter.post('/login', login);
authRouter.get('/mfa/pending', requireMfaPending, mfaPending);
authRouter.post('/mfa/verify-login', requireMfaPending, verifyMfaLogin);
authRouter.post('/logout', logout);
authRouter.get('/me', requireAuth, me);
authRouter.post('/mfa/setup', requireMfaPending, beginMfaSetup);
authRouter.post('/mfa/setup/verify', requireMfaPending, confirmMfaSetup);
authRouter.post('/step-up', requireAuth, stepUp);
