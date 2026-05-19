package com.aria.fleet.controller;

import com.aria.fleet.dto.FleetDtos.*;
import com.aria.fleet.model.AgentHeartbeat;
import com.aria.fleet.model.ContractDebt;
import com.aria.fleet.model.FleetOutcome;
import com.aria.fleet.repository.AgentHeartbeatRepository;
import com.aria.fleet.repository.ContractDebtRepository;
import com.aria.fleet.repository.FleetCircuitBreakerRepository;
import com.aria.fleet.service.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * V27.9 §17.4 + §18I — Fleet Commander + Deadlock Breaker REST surface.
 *   POST /api/fleet/agents                  register a new agent (returns Ed25519 private key once)
 *   POST /api/fleet/events                  publish a signed envelope (sig verified before persist)
 *   GET  /api/fleet/events                  recent events (optionally filtered by epicId)
 *   POST /api/fleet/heartbeats              record a single agent heartbeat
 *   POST /api/fleet/heal/scan               run the healing cascade cycle detector now
 *   POST /api/fleet/deadlock/sweep          run the deadlock breaker now
 *   POST /api/fleet/shadow                  open a Pre-Cog shadow branch row
 *   GET  /api/fleet/debts                   list unresolved contract debts
 *   GET  /api/fleet/breakers                list open circuit breakers
 */
@RestController
@RequestMapping("/api/fleet")
@RequiredArgsConstructor
public class FleetController {

    private final AgentRegistryService registry;
    private final FleetCommanderService commander;
    private final HealingGuardrailService guardrail;
    private final DeadlockBreakerService deadlockBreaker;
    private final ShadowBranchService shadow;
    private final AgentHeartbeatRepository heartbeats;
    private final ContractDebtRepository debts;
    private final FleetCircuitBreakerRepository breakers;

    @PostMapping("/agents")
    public ResponseEntity<AgentRegistryService.RegistrationResult> register(@Valid @RequestBody RegisterAgentRequest req) {
        return ResponseEntity.ok(registry.register(req.agentId(), req.agentFamily()));
    }

    @PostMapping("/events")
    public ResponseEntity<FleetOutcome> publish(@Valid @RequestBody PublishEventRequest req) {
        return ResponseEntity.ok(commander.publish(
                req.epicId(), req.topic(), req.payload(), req.agentId(), req.signature()));
    }

    @GetMapping("/events")
    public ResponseEntity<List<FleetOutcome>> recent(@RequestParam(required = false) String epicId) {
        return ResponseEntity.ok(commander.recent(epicId));
    }

    @PostMapping("/heartbeats")
    public ResponseEntity<AgentHeartbeat> heartbeat(@Valid @RequestBody HeartbeatRequest req) {
        AgentHeartbeat saved = heartbeats.save(AgentHeartbeat.builder()
                .agentId(req.agentId())
                .sessionId(req.sessionId())
                .skillSlug(req.skillSlug())
                .state(req.state())
                .waitingOn(req.waitingOn())
                .waitingSince(req.waitingSince())
                .lastOutputAt(req.lastOutputAt())
                .tokensConsumedIdle(req.tokensConsumedIdle() != null ? req.tokensConsumedIdle() : 0)
                .build());
        return ResponseEntity.ok(saved);
    }

    @PostMapping("/heal/scan")
    public ResponseEntity<Map<String, Object>> healScan() {
        List<List<String>> cycles = guardrail.scan();
        return ResponseEntity.ok(Map.of("cycles_detected", cycles.size(), "cycles", cycles));
    }

    @PostMapping("/deadlock/sweep")
    public ResponseEntity<List<ContractDebt>> deadlockSweep() {
        return ResponseEntity.ok(deadlockBreaker.sweep());
    }

    @PostMapping("/shadow")
    public ResponseEntity<Map<String, Object>> openShadow(@Valid @RequestBody OpenShadowBranchRequest req) {
        String branch = shadow.open(req.ticketRef(), req.speculativeDiff());
        return ResponseEntity.ok(Map.of("branch", branch));
    }

    @GetMapping("/debts")
    public ResponseEntity<List<ContractDebt>> openDebts() {
        return ResponseEntity.ok(debts.findByReconciledAtIsNull());
    }

    @GetMapping("/breakers")
    public ResponseEntity<?> openBreakers() {
        return ResponseEntity.ok(breakers.findByClearedAtIsNull());
    }
}
