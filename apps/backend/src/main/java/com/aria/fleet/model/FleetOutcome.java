package com.aria.fleet.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/** V27.9 §17.4 — signed envelope on a Fleet pub/sub topic. */
@Entity
@Table(name = "fleet_outcomes")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FleetOutcome {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "epic_id", nullable = false)
    private String epicId;

    @Column(nullable = false)
    private String topic;

    @Column(nullable = false, columnDefinition = "jsonb")
    private String payload;

    @Column(name = "agent_id", nullable = false, length = 200)
    private String agentId;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String signature;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
