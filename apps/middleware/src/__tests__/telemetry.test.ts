import { describe, it, expect, beforeEach } from 'vitest';
import { TelemetryRegistry } from '../services/telemetry.service';

describe('TelemetryRegistry', () => {
  let r: TelemetryRegistry;
  beforeEach(() => { r = new TelemetryRegistry(); });

  it('renders the static info line', () => {
    expect(r.render()).toContain('aria_middleware_info');
  });

  it('counts via counter.inc()', () => {
    r.counter('aria_test_total').inc();
    r.counter('aria_test_total').inc(4);
    expect(r.render()).toContain('aria_test_total 5');
  });

  it('records histogram buckets and aggregates', () => {
    const h = r.histogram('aria_http_request_duration_ms');
    h.observe(12); h.observe(80); h.observe(450);
    const out = r.render();
    expect(out).toContain('aria_http_request_duration_ms_bucket{le="25"} 1');
    expect(out).toContain('aria_http_request_duration_ms_bucket{le="100"} 2');
    expect(out).toContain('aria_http_request_duration_ms_bucket{le="500"} 3');
    expect(out).toContain('aria_http_request_duration_ms_count 3');
  });

  it('sets gauges to absolute values', () => {
    r.gauge('aria_queue_depth').set(7);
    r.gauge('aria_queue_depth').set(3);
    expect(r.render()).toContain('aria_queue_depth 3');
  });
});
