import 'dotenv/config';
import { createApp } from './app';
import { validateEnv } from './config/env';
import { logger } from './config/logger';

const env = validateEnv();
const PORT = env.MIDDLEWARE_PORT;

const app = createApp(env);

const server = app.listen(PORT, () => {
  logger.info(`ARIA Middleware running on port ${PORT}`);
  logger.info(`Environment: ${env.NODE_ENV}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  server.close(() => {
    logger.info('Server closed.');
    process.exit(0);
  });
});

export default app;
