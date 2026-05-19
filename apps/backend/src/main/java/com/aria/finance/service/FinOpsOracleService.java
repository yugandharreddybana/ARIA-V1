package com.aria.finance.service;

import com.aria.finance.model.Budget;
import com.aria.finance.repository.BudgetRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Optional;
import java.util.UUID;

/**
 * V27.9 §11 — FinOps Oracle.
 *
 * Pre-flight cost gate at `/startwork`. Coefficients live here (ADR-0021) so changes are
 * reviewable. All amounts in USD; tokens are token-count, not USD.
 *
 * Estimation model (deterministic — no LLM):
 *
 *   total_usd =
 *       tokens          * token_usd_per_kilo / 1_000
 *     + compute_minutes * compute_usd_per_minute
 *     + storage_gb_days * storage_usd_per_gb_day
 *     + third_party_usd
 *
 * Two coefficient tables — `local` (Ollama, free) and `remote` (Anthropic, paid). Caller picks
 * based on the session's expected backend mix.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FinOpsOracleService {

    // ── Coefficients (ADR-0021) ────────────────────────────────────────────
    public static final BigDecimal TOKEN_USD_PER_KILO_LOCAL   = new BigDecimal("0.0000");   // Ollama = free
    public static final BigDecimal TOKEN_USD_PER_KILO_REMOTE  = new BigDecimal("3.0000");   // sonnet $3/M ≈ $3/k * 1000 — placeholder until pricing dial is hooked up
    public static final BigDecimal COMPUTE_USD_PER_MINUTE     = new BigDecimal("0.0100");
    public static final BigDecimal STORAGE_USD_PER_GB_DAY     = new BigDecimal("0.0008");

    public record EstimateInput(
            long   tokens,
            int    computeMinutes,
            double storageGbDays,
            BigDecimal thirdPartyUsd,
            boolean remoteBackend
    ) {}

    public record Estimate(
            BigDecimal totalUsd,
            BigDecimal tokensUsd,
            BigDecimal computeUsd,
            BigDecimal storageUsd,
            BigDecimal thirdPartyUsd
    ) {}

    /** Pure-function cost estimator used by `FinOpsOracleServiceTest`. */
    public static Estimate estimate(EstimateInput in) {
        BigDecimal tokenRate  = in.remoteBackend ? TOKEN_USD_PER_KILO_REMOTE : TOKEN_USD_PER_KILO_LOCAL;
        BigDecimal tokensUsd  = BigDecimal.valueOf(in.tokens)
                .multiply(tokenRate)
                .divide(BigDecimal.valueOf(1_000), 4, RoundingMode.HALF_UP);
        BigDecimal computeUsd = BigDecimal.valueOf(in.computeMinutes).multiply(COMPUTE_USD_PER_MINUTE);
        BigDecimal storageUsd = BigDecimal.valueOf(in.storageGbDays).multiply(STORAGE_USD_PER_GB_DAY)
                .setScale(4, RoundingMode.HALF_UP);
        BigDecimal thirdParty = in.thirdPartyUsd != null ? in.thirdPartyUsd : BigDecimal.ZERO;
        BigDecimal total      = tokensUsd.add(computeUsd).add(storageUsd).add(thirdParty)
                .setScale(4, RoundingMode.HALF_UP);
        return new Estimate(total, tokensUsd, computeUsd, storageUsd, thirdParty);
    }

    private final BudgetRepository budgets;

    /** Gate `/startwork` — true ⇒ the session may run. */
    @Transactional
    public StartWorkDecision gate(UUID sessionId, EstimateInput in) {
        Estimate est = estimate(in);
        Optional<Budget> maybe = budgets.findByScopeAndScopeRef("session", sessionId);
        if (maybe.isEmpty()) {
            // Implicit budget = the session's tokenBudget, allocated on first call.
            return new StartWorkDecision(true, est, "no-explicit-budget", BigDecimal.ZERO, BigDecimal.ZERO);
        }
        Budget b = maybe.get();
        BigDecimal hardCap = BigDecimal.valueOf(b.getTokensAllocated())
                .multiply(b.getHardStopRatio())
                .setScale(0, RoundingMode.HALF_UP);
        long projectedTokens = b.getTokensUsed() + b.getTokensReserved() + in.tokens;
        boolean tokenOk = BigDecimal.valueOf(projectedTokens).compareTo(hardCap) <= 0;
        BigDecimal totalUsdSoFar = b.getComputeUsd().add(b.getStorageUsd()).add(b.getThirdPartyUsd());
        BigDecimal projectedUsd  = totalUsdSoFar.add(est.totalUsd());
        boolean usdOk = projectedUsd.compareTo(new BigDecimal("100000")) < 0;  // sanity ceiling
        boolean allow = tokenOk && usdOk;
        if (!allow) {
            log.warn("FINOPS_GATE_REJECTED session={} projectedTokens={} hardCap={} projectedUsd={}",
                    sessionId, projectedTokens, hardCap, projectedUsd);
        }
        return new StartWorkDecision(allow, est,
                allow ? "ok" : (tokenOk ? "usd-cap-reached" : "token-cap-reached"),
                BigDecimal.valueOf(projectedTokens), projectedUsd);
    }

    @Transactional
    public Budget allocate(String scope, UUID scopeRef, long tokens) {
        Budget b = budgets.findByScopeAndScopeRef(scope, scopeRef).orElseGet(() ->
                Budget.builder().scope(scope).scopeRef(scopeRef).tokensAllocated(0L).build());
        b.setTokensAllocated(b.getTokensAllocated() + tokens);
        return budgets.save(b);
    }

    @Transactional
    public Budget reserve(String scope, UUID scopeRef, long tokens) {
        Budget b = budgets.findByScopeAndScopeRef(scope, scopeRef).orElseThrow();
        b.setTokensReserved(b.getTokensReserved() + tokens);
        return budgets.save(b);
    }

    @Transactional
    public Budget consume(String scope, UUID scopeRef, long actualTokens, long releasedReserved) {
        Budget b = budgets.findByScopeAndScopeRef(scope, scopeRef).orElseThrow();
        b.setTokensUsed(b.getTokensUsed() + actualTokens);
        b.setTokensReserved(Math.max(0, b.getTokensReserved() - releasedReserved));
        return budgets.save(b);
    }

    public record StartWorkDecision(boolean allow, Estimate estimate, String reason, BigDecimal projectedTokens, BigDecimal projectedUsd) {}
}
