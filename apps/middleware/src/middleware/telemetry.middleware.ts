import type { Request, Response, NextFunction } from 'express';
import { getTelemetry } from '../services/telemetry.service';

/**
 * Records `aria_http_requests_total{status, method}` + `aria_http_request_duration_ms`
 * histogram for every request. Mounted after the rate-limiter so 429s also show up.
 */
export function telemetryMiddleware(req: Request, res: Response, next: NextFunction): void {
  const t0 = process.hrtime.bigint();
  const tel = getTelemetry();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1_000_000;
    const status = res.statusCode;
    const family = `${Math.floor(status / 100)}xx`;
    tel.counter(`aria_http_requests_total_${family}`).inc();
    if (status >= 500) tel.counter('aria_http_requests_5xx_total').inc();
    tel.histogram('aria_http_request_duration_ms').observe(ms);
  });
  next();
}
