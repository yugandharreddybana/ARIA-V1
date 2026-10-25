package com.aria.fleet.controller;

import com.aria.fleet.dto.FleetDtos.*;
import com.aria.fleet.model.AgentHeartbeat;
import com.aria.fleet.model.ContractDebt;
import com.aria.fleet.model.FleetOutcome;
import com.aria.fleet.repository.AgentHeartbeatRepository;
import com.aria.fleet.repository.ContractDebtRepository;
import com.aria.fleet.repository.FleetCircuitBreakerRepository;
import com.aria.fleet.service.*;
import com.aria.security.AriaAuthentication;
import com.aria.security.ProjectAccess;
import jakarta.validation.Valid;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

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
    private final ProjectAccess access;

    @PostMapping("/agents")
    public ResponseEntity<AgentRegistryService.RegistrationResult> register(
            @Valid @RequestBody RegisterAgentRequest req,
            @AuthenticationPrincipal AriaAuthentication auth) {
        String workspaceId = ProjectAccess.require(auth).workspaceId();
        var result = registry.register(req.agentId(), req.agentFamily());
        access.stampText("agent_registry", "agent_id", req.agentId(), workspaceId);
        return ResponseEntity.ok(result);
    }

    @PostMapping("/events")
    public ResponseEntity<FleetOutcome> publish(
            @Valid @RequestBody PublishEventRequest req,
            @AuthenticationPrincipal AriaAuthentication auth) {
        String workspaceId = ProjectAccess.require(auth).workspaceId();
        FleetOutcome saved = commander.publish(
                req.epicId(), req.topic(), req.payload(), req.agentId(), req.signature());
        access.stampUuid("fleet_outcomes", saved.getId().toString(), workspaceId);
        saved.setWorkspaceId(UUID.fromString(workspaceId));
        return ResponseEntity.ok(saved);
    }

    @GetMapping("/events")
    public ResponseEntity<List<FleetOutcome>> recent(
            @RequestParam(required = false) String epicId,
            @AuthenticationPrincipal AriaAuthentication auth) {
        return ResponseEntity.ok(commander.recent(epicId, UUID.fromString(ProjectAccess.require(auth).workspaceId())));
    }

    @PostMapping("/heartbeats")
    public ResponseEntity<AgentHeartbeat> heartbeat(
            @Valid @RequestBody HeartbeatRequest req,
            @AuthenticationPrincipal AriaAuthentication auth) {
        AgentHeartbeat saved = heartbeats.save(AgentHeartbeat.builder()
                .workspaceId(UUID.fromString(ProjectAccess.require(auth).workspaceId()))
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
    public ResponseEntity<Map<String, Object>> healScan(@AuthenticationPrincipal AriaAuthentication auth) {
        List<List<String>> cycles = guardrail.scan(UUID.fromString(ProjectAccess.require(auth).workspaceId()));
        return ResponseEntity.ok(Map.of("cycles_detected", cycles.size(), "cycles", cycles));
    }

    @PostMapping("/deadlock/sweep")
    public ResponseEntity<List<ContractDebt>> deadlockSweep(@AuthenticationPrincipal AriaAuthentication auth) {
        return ResponseEntity.ok(deadlockBreaker.sweep(UUID.fromString(ProjectAccess.require(auth).workspaceId())));
    }

    @PostMapping("/shadow")
    public ResponseEntity<Map<String, Object>> openShadow(
            @Valid @RequestBody OpenShadowBranchRequest req,
            @AuthenticationPrincipal AriaAuthentication auth) {
        String branch = shadow.open(req.ticketRef(), req.speculativeDiff(), UUID.fromString(ProjectAccess.require(auth).workspaceId()));
        return ResponseEntity.ok(Map.of("branch", branch));
    }

    @GetMapping("/debts")
    public ResponseEntity<List<ContractDebt>> openDebts(@AuthenticationPrincipal AriaAuthentication auth) {
        return ResponseEntity.ok(debts.findByWorkspaceIdAndReconciledAtIsNull(UUID.fromString(ProjectAccess.require(auth).workspaceId())));
    }

    @GetMapping("/breakers")
    public ResponseEntity<?> openBreakers(@AuthenticationPrincipal AriaAuthentication auth) {
        return ResponseEntity.ok(breakers.findByWorkspaceIdAndClearedAtIsNull(UUID.fromString(ProjectAccess.require(auth).workspaceId())));
    }
}
