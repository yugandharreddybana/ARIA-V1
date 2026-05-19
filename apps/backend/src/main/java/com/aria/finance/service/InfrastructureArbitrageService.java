package com.aria.finance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * V27.9 §17.6 — Infrastructure Arbitrage Engine.
 *
 * Sprint 13 ships the proposal storage + risk classifier. The actual cloud-pricing scraper
 * lands in Sprint 18 (Horizon Scanner) so we reuse the same fetch infra.
 *
 * Risk classifier (deterministic):
 *   - stateful service (postgres, redis, kafka) → at least 'medium'.
 *   - cross-cloud (AWS↔GCP / AWS↔Azure / GCP↔Azure) → bump one level.
 *   - same provider, different region → minimum 'low'.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class InfrastructureArbitrageService {

    private final JdbcTemplate jdbc;

    @Transactional
    public UUID propose(String service, String currentProvider, String candidateProvider,
                        BigDecimal monthlySavingsUsd, String rationaleMd) {
        String risk = classifyRisk(service, currentProvider, candidateProvider);
        UUID id = UUID.randomUUID();
        jdbc.update(
            "INSERT INTO arbitrage_proposals (id, service, current_provider, candidate_provider, monthly_savings_usd, migration_risk, rationale_md, status) " +
            "VALUES (?::uuid, ?, ?, ?, ?, ?, ?, 'proposed')",
            id.toString(), service, currentProvider, candidateProvider, monthlySavingsUsd, risk, rationaleMd);
        log.info("ARBITRAGE_PROPOSED service={} from={} to={} savings_usd={} risk={}",
                service, currentProvider, candidateProvider, monthlySavingsUsd, risk);
        return id;
    }

    /** Pure-function risk classifier — exercised in `InfrastructureArbitrageServiceTest`. */
    public static String classifyRisk(String service, String current, String candidate) {
        if (service == null || current == null || candidate == null) return "high";
        boolean stateful   = service.toLowerCase().matches(".*(postgres|redis|kafka|nats|mongo|elastic).*");
        String curRoot     = providerRoot(current);
        String candRoot    = providerRoot(candidate);
        boolean crossCloud = !curRoot.equals(candRoot);
        if (stateful && crossCloud) return "high";
        if (stateful)               return "medium";
        if (crossCloud)             return "medium";
        return "low";
    }

    private static String providerRoot(String s) {
        String l = s.toLowerCase();
        if (l.startsWith("aws") || l.contains("amazon")) return "aws";
        if (l.startsWith("gcp") || l.contains("google"))  return "gcp";
        if (l.startsWith("azure") || l.contains("microsoft")) return "azure";
        if (l.contains("fly"))   return "fly";
        if (l.contains("railway")) return "railway";
        if (l.contains("digital")) return "do";
        return l;
    }
}
