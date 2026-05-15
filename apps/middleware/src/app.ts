import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { requestLogger } from './middleware/request-logger.middleware';
import { errorMiddleware } from './middleware/error.middleware';
import { notFoundMiddleware } from './middleware/not-found.middleware';
import authRoutes from './routes/auth.routes';
import githubRoutes from './routes/github.routes';
import projectsRoutes from './routes/projects.routes';
import healthRoutes from './routes/health.routes';

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({
  origin: (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(','),
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(requestLogger);

const globalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS ?? 900000),
  max: Number(process.env.RATE_LIMIT_MAX ?? 100),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

app.use('/api/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/auth/github', githubRoutes);
app.use('/api/projects', projectsRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
