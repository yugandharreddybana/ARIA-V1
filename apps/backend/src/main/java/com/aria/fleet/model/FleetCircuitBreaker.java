package com.aria.fleet.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/** V27.9 §17.4 — fleet healing cascade circuit-breaker audit row. */
@Entity
@Table(name = "fleet_circuit_breakers")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FleetCircuitBreaker {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, columnDefinition = "jsonb")
    private String cycle;             // ["agent-a","agent-b","agent-c"]

    @CreationTimestamp
    @Column(name = "detected_at", nullable = false, updatable = false)
    private Instant detectedAt;

    @Column(name = "cleared_at")
    private Instant clearedAt;
}
