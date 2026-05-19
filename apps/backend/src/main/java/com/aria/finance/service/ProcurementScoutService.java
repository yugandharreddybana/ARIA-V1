package com.aria.finance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * V27.9 §11 — Procurement Scout.
 *
 * Compares candidate vendors against a problem statement using a deterministic weighted score:
 *
 *   score = 0.4 * feature_coverage
 *         + 0.3 * (1 - normalised_monthly_cost)
 *         + 0.2 * sla_score
 *         + 0.1 * trust_score
 *
 * `feature_coverage` is the fraction of `requirements` present in `vendor.features_jsonb`.
 * `normalised_monthly_cost` is `cost / max(cost across shortlist)`.
 * `sla_score` comes from `vendor.sla_jsonb.uptime` (decimal in [0,1]).
 *
 * Returns the procurement proposal id; the dashboard reads `procurement_proposals` directly.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ProcurementScoutService {

    private final JdbcTemplate jdbc;

    public record Candidate(UUID vendorId, String name, double monthlyCostUsd, double featureCoverage, double slaUptime, double trustScore) {}
    public record Scored(UUID vendorId, String name, double score, double monthlyCostUsd, List<String> pros, List<String> cons) {}

    @Transactional
    public UUID propose(String proposedBy, String problem, String category,
                        List<Candidate> candidates, List<String> requirements) {
        List<Scored> scored = score(candidates, requirements);
        // Sort descending, pick top.
        scored.sort((a, b) -> Double.compare(b.score, a.score));
        UUID recommendId = scored.isEmpty() ? null : scored.get(0).vendorId;

        String json = toJsonArray(scored);
        UUID id = UUID.randomUUID();
        jdbc.update(
            "INSERT INTO procurement_proposals (id, proposed_by, problem_statement, category, shortlist, recommendation_id, status) " +
            "VALUES (?::uuid, ?, ?, ?, ?::jsonb, ?::uuid, 'submitted')",
            id.toString(), proposedBy, problem, category, json,
            recommendId == null ? null : recommendId.toString());

        log.info("PROCUREMENT_PROPOSAL id={} candidates={} top={}", id, candidates.size(),
                scored.isEmpty() ? "none" : scored.get(0).name);
        return id;
    }

    /** Pure-function scorer used in `ProcurementScoutServiceTest`. */
    public static List<Scored> score(List<Candidate> candidates, List<String> requirements) {
        if (candidates.isEmpty()) return List.of();
        double maxCost = candidates.stream().mapToDouble(c -> c.monthlyCostUsd).max().orElse(1.0);
        if (maxCost <= 0) maxCost = 1.0;
        List<Scored> out = new ArrayList<>();
        for (Candidate c : candidates) {
            double normCost = c.monthlyCostUsd / maxCost;
            double score = 0.4 * c.featureCoverage
                         + 0.3 * (1 - normCost)
                         + 0.2 * c.slaUptime
                         + 0.1 * c.trustScore;
            List<String> pros = new ArrayList<>();
            List<String> cons = new ArrayList<>();
            if (c.featureCoverage >= 0.9) pros.add("Covers all listed requirements");
            if (c.slaUptime       >= 0.99) pros.add("SLA ≥ 99% uptime");
            if (c.trustScore      >= 0.9)  pros.add("High trust score");
            if (c.monthlyCostUsd == maxCost && candidates.size() > 1) cons.add("Highest monthly cost in shortlist");
            if (c.featureCoverage < 0.7)  cons.add("Misses several listed requirements");
            out.add(new Scored(c.vendorId, c.name, Math.round(score * 1000.0) / 1000.0, c.monthlyCostUsd, pros, cons));
        }
        return out;
    }

    private static String toJsonArray(List<Scored> scored) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < scored.size(); i++) {
            Scored s = scored.get(i);
            if (i > 0) sb.append(',');
            sb.append("{\"vendor_id\":\"").append(s.vendorId).append('"')
              .append(",\"name\":\"").append(esc(s.name)).append('"')
              .append(",\"score\":").append(s.score)
              .append(",\"monthly_cost_usd\":").append(s.monthlyCostUsd)
              .append(",\"pros\":").append(toJsonStrArray(s.pros))
              .append(",\"cons\":").append(toJsonStrArray(s.cons))
              .append('}');
        }
        return sb.append(']').toString();
    }
    private static String toJsonStrArray(List<String> xs) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < xs.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(esc(xs.get(i))).append('"');
        }
        return sb.append(']').toString();
    }
    private static String esc(String s) { return s == null ? "" : s.replace("\\","\\\\").replace("\"","\\\""); }
}
