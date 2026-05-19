package com.aria.fleet.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/** V27.9 §18I — per-agent heartbeat used by the Deadlock Breaker. */
@Entity
@Table(name = "agent_heartbeats")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AgentHeartbeat {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "agent_id", nullable = false, length = 200)
    private String agentId;

    @Column(name = "session_id")
    private UUID sessionId;

    @Column(name = "skill_slug", length = 100)
    private String skillSlug;

    @Column(nullable = false, length = 32)
    private String state;            // active | waiting | blocked | complete | error

    @Column(name = "waiting_on", length = 200)
    private String waitingOn;

    @Column(name = "waiting_since")
    private Instant waitingSince;

    @Column(name = "last_output_at")
    private Instant lastOutputAt;

    @Column(name = "tokens_consumed_idle", nullable = false)
    @Builder.Default
    private Integer tokensConsumedIdle = 0;

    @CreationTimestamp
    @Column(name = "observed_at", nullable = false, updatable = false)
    private Instant observedAt;
}
