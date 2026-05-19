package com.aria.finance.controller;

import com.aria.finance.service.*;
import com.aria.finance.service.FinOpsOracleService.EstimateInput;
import com.aria.finance.service.FinOpsOracleService.StartWorkDecision;
import com.aria.finance.service.ProcurementScoutService.Candidate;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/finance")
@RequiredArgsConstructor
public class FinanceController {

    private final FinOpsOracleService finops;
    private final ProcurementScoutService scout;
    private final CorporateTreasuryService treasury;
    private final InfrastructureArbitrageService arbitrage;
    private final DiplomatAgentService diplomat;

    // ── FinOps Oracle ──────────────────────────────────────────────────────
    public record EstimateRequest(
            @NotNull UUID sessionId,
            long tokens,
            int computeMinutes,
            double storageGbDays,
            BigDecimal thirdPartyUsd,
            boolean remoteBackend) {}

    @PostMapping("/finops/estimate")
    public ResponseEntity<StartWorkDecision> estimate(@Valid @RequestBody EstimateRequest req) {
        return ResponseEntity.ok(finops.gate(req.sessionId(),
                new EstimateInput(req.tokens(), req.computeMinutes(), req.storageGbDays(),
                                  req.thirdPartyUsd(), req.remoteBackend())));
    }

    public record AllocateRequest(@NotBlank String scope, @NotNull UUID scopeRef, long tokens) {}
    @PostMapping("/finops/allocate")
    public ResponseEntity<?> allocate(@Valid @RequestBody AllocateRequest req) {
        return ResponseEntity.ok(finops.allocate(req.scope(), req.scopeRef(), req.tokens()));
    }

    // ── Procurement Scout ──────────────────────────────────────────────────
    public record ProposeRequest(
            @NotBlank String proposedBy,
            @NotBlank String problem,
            @NotBlank String category,
            List<Candidate> candidates,
            List<String> requirements) {}

    @PostMapping("/procurement/proposals")
    public ResponseEntity<Map<String, UUID>> propose(@Valid @RequestBody ProposeRequest req) {
        UUID id = scout.propose(req.proposedBy(), req.problem(), req.category(),
                req.candidates() == null ? List.of() : req.candidates(),
                req.requirements() == null ? List.of() : req.requirements());
        return ResponseEntity.ok(Map.of("proposalId", id));
    }

    // ── Corporate Treasury (Stripe Issuing stub) ───────────────────────────
    public record IssueCardRequest(UUID vendorId, BigDecimal spendLimitUsd) {}
    @PostMapping("/treasury/cards")
    public ResponseEntity<CorporateTreasuryService.VirtualCard> issueCard(@RequestBody IssueCardRequest req) {
        return ResponseEntity.ok(treasury.issue(req.vendorId(), req.spendLimitUsd()));
    }

    public record FreezeCardRequest(@NotBlank String stripeCardId, @NotBlank String reason) {}
    @PostMapping("/treasury/cards/freeze")
    public ResponseEntity<?> freezeCard(@Valid @RequestBody FreezeCardRequest req) {
        treasury.freeze(req.stripeCardId(), req.reason());
        return ResponseEntity.ok(Map.of("status", "frozen"));
    }

    // ── Infrastructure Arbitrage ───────────────────────────────────────────
    public record ArbitrageRequest(
            @NotBlank String service,
            @NotBlank String currentProvider,
            @NotBlank String candidateProvider,
            @NotNull BigDecimal monthlySavingsUsd,
            @NotBlank String rationaleMd) {}
    @PostMapping("/arbitrage/proposals")
    public ResponseEntity<Map<String, UUID>> arbitragePropose(@Valid @RequestBody ArbitrageRequest req) {
        return ResponseEntity.ok(Map.of("proposalId",
                arbitrage.propose(req.service(), req.currentProvider(), req.candidateProvider(),
                                  req.monthlySavingsUsd(), req.rationaleMd())));
    }

    // ── Diplomat playbook ──────────────────────────────────────────────────
    public record DiplomatRequest(@NotBlank String vendor, @NotNull BigDecimal targetUsd, List<String> competitors) {}
    @PostMapping("/diplomat/playbook")
    public ResponseEntity<DiplomatAgentService.Playbook> diplomatPlaybook(@Valid @RequestBody DiplomatRequest req) {
        return ResponseEntity.ok(diplomat.negotiate(req.vendor(), req.targetUsd(),
                req.competitors() == null ? List.of() : req.competitors()));
    }
}
