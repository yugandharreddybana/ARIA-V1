package com.aria.telemetry.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Tiny Prometheus-style counter + gauge registry — exposed at `/metrics` by
 * {@link com.aria.telemetry.controller.MetricsController}. Sprint 9 ships this minimal
 * implementation so observability isn't blocked on the full OpenTelemetry SDK wiring (the
 * heavier OTEL exporter lands in Sprint 14 once Testcontainers can host Tempo).
 */
@Slf4j
@Component
public class PrometheusMetrics {

    private final Map<String, AtomicLong> counters = new ConcurrentHashMap<>();
    private final Map<String, AtomicLong> gauges   = new ConcurrentHashMap<>();

    public void incCounter(String name)       { counters.computeIfAbsent(name, k -> new AtomicLong()).incrementAndGet(); }
    public void addCounter(String name, long n){ counters.computeIfAbsent(name, k -> new AtomicLong()).addAndGet(n); }
    public void setGauge(String name, long v) { gauges.computeIfAbsent(name, k -> new AtomicLong()).set(v); }

    /** Render the Prometheus text-exposition format. */
    public String render() {
        StringBuilder sb = new StringBuilder(1024);
        sb.append("# HELP aria_app_info Static info about the ARIA backend.\n")
          .append("# TYPE aria_app_info gauge\n")
          .append("aria_app_info{version=\"0.1.0\"} 1\n");
        for (Map.Entry<String, AtomicLong> e : counters.entrySet()) {
            sb.append("# TYPE ").append(e.getKey()).append(" counter\n")
              .append(e.getKey()).append(' ').append(e.getValue().get()).append('\n');
        }
        for (Map.Entry<String, AtomicLong> e : gauges.entrySet()) {
            sb.append("# TYPE ").append(e.getKey()).append(" gauge\n")
              .append(e.getKey()).append(' ').append(e.getValue().get()).append('\n');
        }
        return sb.toString();
    }
}
