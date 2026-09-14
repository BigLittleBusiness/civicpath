import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { sequelize } from './config/database.js';
import './models/index.js';
import { v1Router } from './routes/v1/index.js';
import { errorHandler, notFound } from './middleware/errors.js';
import { registerScheduledJobs } from './scheduledJobs.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: env.frontendUrl, credentials: true, methods: ['GET', 'POST', 'PATCH', 'DELETE'] }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/v1/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many sign-in attempts. Please try again later.' } }));
app.use('/v1', rateLimit({ windowMs: 15 * 60 * 1000, limit: 400, standardHeaders: 'draft-8', legacyHeaders: false }), v1Router);
app.use(notFound);
app.use(errorHandler);

async function start() {
  await sequelize.authenticate();
  registerScheduledJobs();
  app.listen(env.port, () => console.info(`CivicPath API listening on ${env.port}`));
}

if (process.env.NODE_ENV !== 'test') start().catch((error) => { console.error(error); process.exit(1); });
export { app };
