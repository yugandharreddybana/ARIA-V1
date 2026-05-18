package com.aria.incident.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/** V27.9 §17 — honeypot row that production code MUST NEVER reference (ADR-0013). */
@Entity
@Table(name = "semantic_tripwires", uniqueConstraints = @UniqueConstraint(columnNames = {"table_name","honeypot"}))
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SemanticTripwire {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "table_name", nullable = false)
    private String tableName;

    @Column(name = "column_name", nullable = false)
    private String columnName;

    @Column(nullable = false)
    private String honeypot;

    @CreationTimestamp
    @Column(name = "installed_at", nullable = false, updatable = false)
    private Instant installedAt;

    @Column(name = "triggered_at")
    private Instant triggeredAt;

    @Column(name = "trigger_meta", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private String triggerMeta = "{}";
}
