package com.aria.incident;

import com.aria.incident.config.SloBootstrap;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SloBootstrapTest {

    @Test
    void parses_minimal_slos_yaml() {
        String yaml = """
                slos:
                  - service: middleware
                    name: availability
                    metric: error_rate
                    threshold: 0.01
                    comparison: "<"
                    window_seconds: 300
                    description: "5xx rate"
                  - service: backend
                    name: latency_p99
                    metric: p99_latency_ms
                    threshold: 1500
                    comparison: "<"
                    window_seconds: 300
                    description: "orchestrator latency"
                """;
        List<SloBootstrap.ParsedSlo> out = SloBootstrap.parse(yaml);
        assertThat(out).hasSize(2);
        assertThat(out.get(0).service()).isEqualTo("middleware");
        assertThat(out.get(0).threshold()).isEqualTo(0.01);
        assertThat(out.get(1).metric()).isEqualTo("p99_latency_ms");
        assertThat(out.get(1).windowSeconds()).isEqualTo(300);
    }

    @Test
    void empty_yaml_returns_empty_list() {
        assertThat(SloBootstrap.parse("")).isEmpty();
    }
}
