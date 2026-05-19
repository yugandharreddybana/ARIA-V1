package com.aria.incident.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/** V27.9 §17 — runtime incident raised by SLO breach, Red Team finding, or operator. */
@Entity
@Table(name = "incidents")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class Incident {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @CreationTimestamp
    @Column(name = "detected_at", nullable = false, updatable = false)
    private Instant detectedAt;

    @Column(nullable = false, length = 100)
    private String source;          // "slo-breach" | "red-team" | "operator" | "tripwire"

    @Column(nullable = false, length = 4)
    private String severity;        // P0 | P1 | P2 | P3

    @Column(nullable = false, length = 500)
    private String title;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(name = "related_commits", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private String relatedCommits = "[]";

    @Column(name = "related_session_id")
    private UUID relatedSessionId;

    @Column(name = "jira_ref", length = 100)
    private String jiraRef;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String status = "open";

    @Column(name = "resolved_at")
    private Instant resolvedAt;
}
