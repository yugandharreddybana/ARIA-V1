package com.aria.orchestrator.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * V27.9 §4 Session entity owned by the Orchestrator (Sprint 5).
 *
 * Maps to the Postgres `sessions` table extended by V5__sprint5_token_gateway.sql.
 * Enums are stored as TEXT (with CHECK constraints at the DB level) for clean Hibernate interop.
 */
@Entity
@Table(name = "sessions",
        indexes = {
                @Index(name = "idx_sessions_project_id",   columnList = "project_id"),
                @Index(name = "idx_sessions_workspace_id", columnList = "workspace_id"),
                @Index(name = "idx_sessions_user_id",      columnList = "user_id"),
                @Index(name = "idx_sessions_state",        columnList = "state")
        })
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Session {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(name = "workspace_id")
    private UUID workspaceId;

    @Column(name = "user_id")
    private UUID userId;

    /** Lifecycle state. Stored as TEXT with CHECK constraint; the wire name for `new_` is `new`. */
    @Column(name = "state", nullable = false, length = 32)
    private String state;

    @Column(name = "mode", nullable = false, length = 32)
    private String mode;

    @Column(name = "environment", nullable = false, length = 32)
    private String environment;

    @Column(name = "mission_type", nullable = false, length = 32)
    private String missionType;

    @Column(name = "mission_risk_appetite", nullable = false, length = 20)
    private String missionRiskAppetite;

    @Column(name = "mission_scope", nullable = false, columnDefinition = "jsonb")
    private String missionScope;

    @Column(name = "token_budget")
    private Integer tokenBudget;

    @Column(name = "time_budget_minutes")
    private Integer timeBudgetMinutes;

    @Column(name = "is_first_start", nullable = false)
    @Builder.Default
    private boolean firstStart = false;

    @Column(name = "brief_summary")
    private String briefSummary;

    @CreationTimestamp
    @Column(name = "started_at", nullable = false, updatable = false)
    private Instant startedAt;

    @Column(name = "ended_at")
    private Instant endedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private Instant updatedAt;
}
