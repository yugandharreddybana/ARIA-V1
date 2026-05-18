import 'dotenv/config';
import http from 'node:http';
import { createApp } from './app';
import { validateEnv } from './config/env';
import { logger } from './config/logger';
import { createWsServer } from './ws';
import { closePgPool } from './services/db.client';
import { startSystemAlertsConsumer, stopSystemAlertsConsumer } from './services/systemAlerts.consumer';

const env = validateEnv();
const PORT = env.MIDDLEWARE_PORT;

const app = createApp(env);
const server = http.createServer(app);
const io = createWsServer(server);

server.listen(PORT, () => {
  logger.info(`ARIA Middleware listening on port ${PORT}`);
  logger.info(`WebSocket path: /ws`);
  logger.info(`Environment: ${env.NODE_ENV}`);
});

// V27.9 §17 — consume `system.alerts` from Redis and forward to the IncidentCommander.
startSystemAlertsConsumer();

async function shutdown(signal: string): Promise<void> {
  logger.info(`${signal} received. Shutting down gracefully...`);
  stopSystemAlertsConsumer();
  io.close();
  server.close(async () => {
    await closePgPool();
    logger.info('Server closed.');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced exit after 10s timeout.');
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT',  () => void shutdown('SIGINT'));

export default app;
