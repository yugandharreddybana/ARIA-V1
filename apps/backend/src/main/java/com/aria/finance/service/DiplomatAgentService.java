package com.aria.finance.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * V27.9 §11 — Diplomat Agent (B2B vendor negotiation playbook engine).
 *
 * Sprint 13 ships a deterministic playbook generator that turns a budget + target into a
 * five-step negotiation script. Sprint 17 wires the LLM-driven counter-offer drafter behind
 * the same `negotiate()` signature.
 *
 * Playbook stages:
 *   1. Kickoff       — share the use-case + reference architecture.
 *   2. Discovery     — ask for tier breakdown, volume tiers, custom-deal levers.
 *   3. Counter       — offer at floor (target - 10%) referencing competitive shortlist.
 *   4. Concession    — meet in the middle if vendor moves; hold otherwise.
 *   5. Close         — confirm SLAs, exit clauses, data residency, audit rights.
 */
@Slf4j
@Service
public class DiplomatAgentService {

    public record Stage(String name, String objective, List<String> talkingPoints) {}
    public record Playbook(String vendor, BigDecimal targetUsd, BigDecimal floorUsd, List<Stage> stages) {}

    public Playbook negotiate(String vendor, BigDecimal targetUsd, List<String> shortlistCompetitors) {
        BigDecimal floor = targetUsd.multiply(new BigDecimal("0.9")).setScale(2, java.math.RoundingMode.HALF_UP);
        String competitors = shortlistCompetitors == null || shortlistCompetitors.isEmpty()
                ? "(no shortlist supplied)"
                : String.join(", ", shortlistCompetitors);
        List<Stage> stages = List.of(
            new Stage("kickoff", "Anchor the use-case + scale",
                List.of("Share architecture diagram + usage projections",
                        "Confirm the buying entity + decision timeline",
                        "Ask about reference customers in our segment")),
            new Stage("discovery", "Surface every lever",
                List.of("Request tier breakdown + volume discount schedule",
                        "Ask about multi-year, prepayment, and equity-credit discounts",
                        "Confirm SLA, data residency, audit-rights baseline")),
            new Stage("counter", "Open at floor against shortlist",
                List.of("Open at $" + floor + " — cite shortlist: " + competitors,
                        "Frame as fair-market reset, not a haggle",
                        "Offer a public case-study slot as a non-price concession")),
            new Stage("concession", "Meet halfway if they move",
                List.of("If vendor moves > 5%, offer to extend term length by 12 months",
                        "If vendor refuses, escalate to FinOps Oracle for shortlist re-rank")),
            new Stage("close", "Lock contractual safety net",
                List.of("99.9% uptime SLA with service credits",
                        "Data residency confirmed for required regions",
                        "Audit rights + breach-notification clause (24h)",
                        "Exit clause + data-portability commitment"))
        );
        log.info("DIPLOMAT_PLAYBOOK vendor={} target_usd={} floor_usd={}", vendor, targetUsd, floor);
        return new Playbook(vendor, targetUsd, floor, stages);
    }

    /** Convenience for callers that want to serialise the playbook to a markdown brief. */
    public String renderMarkdown(Playbook p) {
        StringBuilder sb = new StringBuilder();
        sb.append("# Negotiation playbook — ").append(p.vendor()).append("\n\n");
        sb.append("Target: $").append(p.targetUsd()).append(" — Floor: $").append(p.floorUsd()).append("\n\n");
        for (Stage s : p.stages()) {
            sb.append("## ").append(s.name()).append(" — ").append(s.objective()).append("\n\n");
            for (String t : s.talkingPoints()) sb.append("- ").append(t).append('\n');
            sb.append('\n');
        }
        return sb.toString();
    }

    /** Suppress the unused-import lint for `Map` so future signatures can grow without a warning. */
    @SuppressWarnings("unused")
    private static void __forwardCompatMap(Map<String, ?> ignored) { /* no-op */ }
}
