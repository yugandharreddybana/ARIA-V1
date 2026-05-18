/**
 * Minimal Prometheus-style telemetry for the middleware (V27.9 §17).
 *
 * Tracks: HTTP request totals + latency histograms (via simple time-window aggregator),
 * Token Gateway queue depth, sanitizer quarantine events, distillation runs.
 *
 * Exposed via `/metrics` in the text exposition format. The full OpenTelemetry SDK +
 * OTLP exporter is Sprint 14 work; this gets the dashboards live in Sprint 9 without
 * pulling otel deps.
 */

import { EventEmitter } from 'node:events';

interface HistogramBucket { le: number; count: number }
const DEFAULT_BUCKETS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

class Histogram {
  private buckets: HistogramBucket[] = DEFAULT_BUCKETS.map(le => ({ le, count: 0 }));
  private sum = 0;
  private count = 0;
  observe(valueMs: number): void {
    this.sum += valueMs;
    this.count += 1;
    for (const b of this.buckets) if (valueMs <= b.le) b.count += 1;
  }
  render(name: string, labels: string): string {
    const lines: string[] = [];
    for (const b of this.buckets) {
      lines.push(`${name}_bucket{${labels}le="${b.le}"} ${b.count}`);
    }
    lines.push(`${name}_bucket{${labels}le="+Inf"} ${this.count}`);
    lines.push(`${name}_sum{${labels.replace(/,$/, '')}} ${this.sum}`);
    lines.push(`${name}_count{${labels.replace(/,$/, '')}} ${this.count}`);
    return lines.join('\n');
  }
}

class Counter { value = 0; inc(by = 1): void { this.value += by; } }
class Gauge   { value = 0; set(v: number): void { this.value = v; } }

export class TelemetryRegistry {
  readonly events = new EventEmitter();
  private counters = new Map<string, Counter>();
  private gauges   = new Map<string, Gauge>();
  private histograms = new Map<string, Histogram>();

  counter(name: string): Counter {
    let c = this.counters.get(name);
    if (!c) { c = new Counter(); this.counters.set(name, c); }
    return c;
  }
  gauge(name: string): Gauge {
    let g = this.gauges.get(name);
    if (!g) { g = new Gauge(); this.gauges.set(name, g); }
    return g;
  }
  histogram(name: string): Histogram {
    let h = this.histograms.get(name);
    if (!h) { h = new Histogram(); this.histograms.set(name, h); }
    return h;
  }

  render(): string {
    const lines: string[] = [];
    lines.push(`# HELP aria_middleware_info Static info about the ARIA middleware.`);
    lines.push(`# TYPE aria_middleware_info gauge`);
    lines.push(`aria_middleware_info{version="0.1.0"} 1`);

    for (const [name, c] of this.counters.entries()) {
      lines.push(`# TYPE ${name} counter`);
      lines.push(`${name} ${c.value}`);
    }
    for (const [name, g] of this.gauges.entries()) {
      lines.push(`# TYPE ${name} gauge`);
      lines.push(`${name} ${g.value}`);
    }
    for (const [name, h] of this.histograms.entries()) {
      lines.push(`# TYPE ${name} histogram`);
      lines.push(h.render(name, ''));
    }
    return lines.join('\n') + '\n';
  }
}

let singleton: TelemetryRegistry | null = null;
export function getTelemetry(): TelemetryRegistry {
  if (singleton) return singleton;
  singleton = new TelemetryRegistry();
  return singleton;
}
