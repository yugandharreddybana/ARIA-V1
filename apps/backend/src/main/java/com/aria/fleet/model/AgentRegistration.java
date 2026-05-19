package com.aria.fleet.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;

/** V27.9 §3 + §18B — registered specialist agent with its Ed25519 public key (base64 SPKI). */
@Entity
@Table(name = "agent_registry")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AgentRegistration {

    @Id
    @Column(name = "agent_id", nullable = false, length = 200)
    private String agentId;

    @Column(name = "agent_family", nullable = false, length = 100)
    private String agentFamily;

    @Column(name = "ed25519_pubkey", nullable = false, columnDefinition = "TEXT")
    private String ed25519PubkeyBase64;

    @Column(nullable = false, length = 64)
    private String fingerprint;

    @Column(name = "trust_score", nullable = false, precision = 4, scale = 3)
    @Builder.Default
    private BigDecimal trustScore = BigDecimal.ZERO;

    @Column(nullable = false, length = 32)
    @Builder.Default
    private String status = "active";

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
