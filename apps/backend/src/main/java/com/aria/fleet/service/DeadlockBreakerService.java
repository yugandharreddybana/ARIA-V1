package com.aria.fleet.service;

import com.aria.fleet.model.AgentHeartbeat;
import com.aria.fleet.model.ContractDebt;
import com.aria.fleet.repository.AgentHeartbeatRepository;
import com.aria.fleet.repository.ContractDebtRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * V27.9 §18I + ADR-0015 — Deadlock Breaker.
 *
 *   Heartbeat → wait-graph cycle detection (reuses HealingGuardrailService logic) → if every
 *   member of the cycle has been waiting ≥ DEADLOCK_TIMEOUT, force the producer (first agent
 *   in the cycle) to draft a V1 contract and record a ContractDebt row for human reconciliation.
 *
 * The actual "force V1 draft" prompt is a no-op in Sprint 10 — the row is recorded so the
 * dashboard can surface it and Sprint 14 wires the LLM call through the Token Gateway.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeadlockBreakerService {

    /** Per ADR-0015. */
    public static final Duration DEADLOCK_TIMEOUT = Duration.ofMinutes(3);
    public static final Duration HEARTBEAT_WINDOW = Duration.ofMinutes(2);

    private final AgentHeartbeatRepository heartbeats;
    private final ContractDebtRepository debts;

    @Transactional
    public List<ContractDebt> sweep() {
        Instant now = Instant.now();
        List<AgentHeartbeat> recent = heartbeats.latestPerAgentSince(now.minus(HEARTBEAT_WINDOW));
        Map<String, AgentHeartbeat> byAgent = new HashMap<>();
        Map<String, String> waitGraph = new HashMap<>();
        for (AgentHeartbeat hb : recent) {
            byAgent.put(hb.getAgentId(), hb);
            if ("waiting".equals(hb.getState()) && hb.getWaitingOn() != null) {
                waitGraph.put(hb.getAgentId(), hb.getWaitingOn());
            }
        }

        List<List<String>> cycles = HealingGuardrailService.detectCycles(waitGraph);
        List<ContractDebt> out = new ArrayList<>();
        for (List<String> cycle : cycles) {
            boolean allTimedOut = cycle.stream().allMatch(a -> {
                AgentHeartbeat hb = byAgent.get(a);
                return hb != null && hb.getWaitingSince() != null &&
                        Duration.between(hb.getWaitingSince(), now).compareTo(DEADLOCK_TIMEOUT) >= 0;
            });
            if (!allTimedOut) continue;

            String producer = cycle.get(0);
            List<String> consumers = cycle.subList(1, cycle.size());
            String draftRef = "DRAFT_V1:" + producer + "@" + now.toEpochMilli();

            log.error("DEADLOCK_BREAKER_FORCED producer={} consumers={} draftRef={}",
                    producer, consumers, draftRef);

            ContractDebt cd = ContractDebt.builder()
                    .sessionId(byAgent.get(producer).getSessionId())
                    .producerAgent(producer)
                    .consumerAgents(toJsonArray(consumers))
                    .draftContractRef(draftRef)
                    .reconciliationRequired(true)
                    .build();
            out.add(debts.save(cd));
        }
        return out;
    }

    private static String toJsonArray(List<String> items) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < items.size(); i++) {
            if (i > 0) sb.append(',');
            sb.append('"').append(items.get(i).replace("\"", "\\\"")).append('"');
        }
        return sb.append(']').toString();
    }
}
