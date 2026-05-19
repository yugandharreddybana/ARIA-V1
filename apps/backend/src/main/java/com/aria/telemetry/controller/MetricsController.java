package com.aria.telemetry.controller;

import com.aria.telemetry.service.PrometheusMetrics;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
public class MetricsController {

    private final PrometheusMetrics metrics;

    @GetMapping(path = "/metrics", produces = "text/plain;version=0.0.4;charset=utf-8")
    public ResponseEntity<String> metrics() {
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/plain;version=0.0.4")).body(metrics.render());
    }
}
