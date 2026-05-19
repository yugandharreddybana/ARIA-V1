package com.aria.fleet.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/** V27.9 §18I — Deadlock Breaker contract-debt audit trail. */
@Entity
@Table(name = "contract_debts")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ContractDebt {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "session_id")
    private UUID sessionId;

    @Column(name = "producer_agent", nullable = false, length = 200)
    private String producerAgent;

    @Column(name = "consumer_agents", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private String consumerAgents = "[]";

    @Column(name = "draft_contract_ref", columnDefinition = "TEXT")
    private String draftContractRef;

    @Column(name = "reconciliation_required", nullable = false)
    @Builder.Default
    private boolean reconciliationRequired = true;

    @Column(name = "reconciled_at")
    private Instant reconciledAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
