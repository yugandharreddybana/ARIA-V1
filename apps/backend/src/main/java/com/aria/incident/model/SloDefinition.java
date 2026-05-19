package com.aria.incident.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/** V27.9 §17 + ADR-0011 — SLO definition synced from `.entiresystem/slos.yml` on boot. */
@Entity
@Table(name = "slo_definitions", uniqueConstraints = @UniqueConstraint(columnNames = {"service","name"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SloDefinition {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false)
    private String service;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String metric;

    @Column(nullable = false)
    private java.math.BigDecimal threshold;

    @Column(nullable = false, length = 2)
    private String comparison;            // <  <=  >  >=  ==

    @Column(name = "window_seconds", nullable = false)
    @Builder.Default
    private Integer windowSeconds = 300;

    @Column(columnDefinition = "TEXT")
    private String description;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
