package com.aria.fleet.service;

import com.aria.fleet.model.AgentHeartbeat;
import com.aria.fleet.model.FleetCircuitBreaker;
import com.aria.fleet.repository.AgentHeartbeatRepository;
import com.aria.fleet.repository.FleetCircuitBreakerRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.*;

/**
 * V27.9 §17.4 — Healing cascade circuit breaker.
 *
 * Builds the agent-to-agent "waiting_on" graph from the latest heartbeats in the rolling
 * window and runs DFS to detect cycles. Any detected cycle is persisted to
 * `fleet_circuit_breakers` and surfaces as a FLEET_HEALING_CIRCUIT_BREAKER event so the
 * dashboard can freeze the affected agents.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class HealingGuardrailService {

    private final AgentHeartbeatRepository heartbeats;
    private final FleetCircuitBreakerRepository breakers;

    /** Default lookback for "current" heartbeats. */
    public static final Duration HEARTBEAT_WINDOW = Duration.ofMinutes(2);

    /** Returns every detected cycle (each cycle is the list of agents in traversal order). */
    @Transactional
    public List<List<String>> scan() {
        Instant since = Instant.now().minus(HEARTBEAT_WINDOW);
        List<AgentHeartbeat> recent = heartbeats.latestPerAgentSince(since);

        Map<String, String> waitGraph = new HashMap<>();
        for (AgentHeartbeat hb : recent) {
            if ("waiting".equals(hb.getState()) && hb.getWaitingOn() != null) {
                waitGraph.put(hb.getAgentId(), hb.getWaitingOn());
            }
        }

        List<List<String>> cycles = detectCycles(waitGraph);
        for (List<String> cycle : cycles) {
            log.error("FLEET_HEALING_CIRCUIT_BREAKER cycle={}", cycle);
            breakers.save(FleetCircuitBreaker.builder()
                    .cycle(toJsonArray(cycle))
                    .build());
        }
        return cycles;
    }

    /** Pure-function helper exposed for tests. */
    public static List<List<String>> detectCycles(Map<String, String> waitGraph) {
        List<List<String>> cycles = new ArrayList<>();
        Set<String> globallyVisited = new HashSet<>();
        for (String start : waitGraph.keySet()) {
            if (globallyVisited.contains(start)) continue;
            List<String> path = new ArrayList<>();
            Set<String> onPath = new LinkedHashSet<>();
            String cur = start;
            while (cur != null && !onPath.contains(cur)) {
                if (globallyVisited.contains(cur)) break;       // touched in earlier traversal
                onPath.add(cur);
                path.add(cur);
                cur = waitGraph.get(cur);
            }
            if (cur != null && onPath.contains(cur)) {
                // Cycle from `cur` back to `cur`.
                List<String> cycle = new ArrayList<>();
                boolean inCycle = false;
                for (String n : path) {
                    if (n.equals(cur)) inCycle = true;
                    if (inCycle) cycle.add(n);
                }
                cycles.add(cycle);
            }
            globallyVisited.addAll(onPath);
        }
        return cycles;
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
