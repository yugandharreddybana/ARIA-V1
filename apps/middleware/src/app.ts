import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { validateEnv } from './config/env';
import { requestLogger } from './middleware/request-logger.middleware';
import { errorHandler } from './middleware/error.middleware';
import { notFound } from './middleware/not-found.middleware';
import authRoutes from './routes/auth.routes';
import githubRoutes from './routes/github.routes';
import projectsRoutes from './routes/projects.routes';
import healthRoutes from './routes/health.routes';

const env = validateEnv();
const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS.split(',').map(o => o.trim()), credentials: true }));
app.use(express.json());
app.use(cookieParser(env.COOKIE_SECRET));
app.use(requestLogger);
app.use(rateLimit({ windowMs: env.RATE_LIMIT_WINDOW_MS, max: env.RATE_LIMIT_MAX, standardHeaders: true, legacyHeaders: false }));

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auth/github', githubRoutes);
app.use('/api/projects', projectsRoutes);
app.use(notFound);
app.use(errorHandler);

export default app;
