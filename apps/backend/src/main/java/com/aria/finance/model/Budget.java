package com.aria.finance.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "budgets")
@Getter @Setter @Builder
@NoArgsConstructor @AllArgsConstructor
public class Budget {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, length = 32)
    private String scope;

    @Column(name = "scope_ref")
    private UUID scopeRef;

    @Column(name = "tokens_allocated", nullable = false)
    private Long tokensAllocated;

    @Column(name = "tokens_used", nullable = false)
    @Builder.Default
    private Long tokensUsed = 0L;

    @Column(name = "tokens_reserved", nullable = false)
    @Builder.Default
    private Long tokensReserved = 0L;

    @Column(name = "compute_usd",     nullable = false, precision = 12, scale = 4)
    @Builder.Default
    private BigDecimal computeUsd = BigDecimal.ZERO;

    @Column(name = "storage_usd",     nullable = false, precision = 12, scale = 4)
    @Builder.Default
    private BigDecimal storageUsd = BigDecimal.ZERO;

    @Column(name = "third_party_usd", nullable = false, precision = 12, scale = 4)
    @Builder.Default
    private BigDecimal thirdPartyUsd = BigDecimal.ZERO;

    @Column(name = "warn_at_ratio",   nullable = false, precision = 3, scale = 2)
    @Builder.Default
    private BigDecimal warnAtRatio = new BigDecimal("0.80");

    @Column(name = "hard_stop_ratio", nullable = false, precision = 3, scale = 2)
    @Builder.Default
    private BigDecimal hardStopRatio = new BigDecimal("0.95");

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
