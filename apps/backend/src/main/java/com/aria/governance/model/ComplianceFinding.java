package com.aria.governance.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "compliance_findings")
@Getter @Setter @Builder
@NoArgsConstructor @AllArgsConstructor
public class ComplianceFinding {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "triggered_by", nullable = false)
    private String triggeredBy;

    @Column(name = "trigger_ref")
    private String triggerRef;

    @Column(nullable = false, length = 32)
    private String category;          // pii / logging / retention / encryption / data_export / data_residency

    @Column(nullable = false, length = 32)
    private String severity;          // blocking / warning / info

    @Column(nullable = false, columnDefinition = "TEXT")
    private String description;

    @Column(nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private String evidence = "{}";

    @Column(name = "ticket_ref")
    private String ticketRef;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String status = "open";

    @Column(name = "decided_by")
    private String decidedBy;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
