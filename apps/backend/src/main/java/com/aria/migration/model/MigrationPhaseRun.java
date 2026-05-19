package com.aria.migration.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/** V27.9 §17 — per-phase run of a MigrationPlaybook. */
@Entity
@Table(name = "migration_phase_runs")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MigrationPhaseRun {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "playbook_id", nullable = false)
    private UUID playbookId;

    @Column(name = "phase_index", nullable = false)
    private Integer phaseIndex;

    @Column(name = "phase_name", nullable = false)
    private String phaseName;

    @Column(name = "rollback_type", nullable = false, length = 32)
    private String rollbackType;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String status = "queued";

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private String metrics = "{}";

    @Column(name = "rollback_executed", nullable = false)
    @Builder.Default
    private boolean rollbackExecuted = false;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
