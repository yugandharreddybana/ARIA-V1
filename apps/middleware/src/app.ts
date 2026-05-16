import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { validateEnv } from './config/env';
import { requestLogger } from './middleware/request-logger.middleware';
import { errorHandler } from './middleware/error.middleware';
import { notFound } from './middleware/not-found.middleware';
import authRouter from './routes/auth.routes';
import projectsRoutes from './routes/projects.routes';
import analysisRoutes from './routes/analysis.routes';
import graphRoutes from './routes/graph.routes';
import healthRoutes from './routes/health.routes';
import ticketsRoutes from './routes/tickets.routes';
import sessionsRoutes from './routes/sessions.routes';
import skillsRoutes from './routes/skills.routes';
import ideasRoutes from './routes/ideas.routes';
import aiRoutes from './routes/ai.routes';

const env = validateEnv();
const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGINS.split(',').map(o => o.trim()), credentials: true }));
app.use(express.json());
app.use(cookieParser(env.COOKIE_SECRET));
app.use(requestLogger);
app.use(rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.use('/api/health',        healthRoutes);
app.use('/api/auth',          authRouter);
app.use('/api/projects',      projectsRoutes);
app.use('/api/projects',      skillsRoutes);   // /:projectId/skills and /:projectId/teams
app.use('/api/analysis/jobs', analysisRoutes);
app.use('/api/graph',         graphRoutes);
app.use('/api/tickets',       ticketsRoutes);
app.use('/api/sessions',      sessionsRoutes);
app.use('/api/ideas',         ideasRoutes);
app.use('/api/ai',            aiRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
