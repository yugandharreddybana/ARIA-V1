package com.aria.governance.controller;

import com.aria.governance.model.ComplianceFinding;
import com.aria.governance.service.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * V27.9 §12 + §13.7 + §20 — Governance REST surface.
 *   POST /api/governance/compliance/scan       run the auditor over a diff blob
 *   GET  /api/governance/compliance            list recent findings
 *   POST /api/governance/compliance/{id}/decide   accept / reject / mitigate
 *   POST /api/governance/gdpr/redact           record a GDPR redaction
 *   POST /api/governance/audit/export          /aria export-audit-trail
 *   POST /api/governance/explain/{sessionId}   /aria explain <session>
 */
@RestController
@RequestMapping("/api/governance")
@RequiredArgsConstructor
public class GovernanceController {

    private final ComplianceAuditorService compliance;
    private final GdprRedactionService     redaction;
    private final AuditExportService       export;
    private final DecisionExplainerService explainer;

    public record ScanRequest(@NotBlank String triggeredBy, String triggerRef, String diffPath, @NotBlank String diff) {}
    @PostMapping("/compliance/scan")
    public ResponseEntity<List<ComplianceFinding>> scan(@Valid @RequestBody ScanRequest req) {
        return ResponseEntity.ok(compliance.scanDiff(req.triggeredBy(), req.triggerRef(), req.diffPath(), req.diff()));
    }

    @GetMapping("/compliance")
    public ResponseEntity<List<ComplianceFinding>> recent() { return ResponseEntity.ok(compliance.recent()); }

    public record DecideRequest(
            @NotBlank String decidedBy,
            @Pattern(regexp = "accepted|rejected|mitigated") String to) {}
    @PostMapping("/compliance/{id}/decide")
    public ResponseEntity<ComplianceFinding> decide(@PathVariable UUID id, @Valid @RequestBody DecideRequest req) {
        return ResponseEntity.ok(compliance.decide(id, req.decidedBy(), req.to()));
    }

    public record RedactRequest(
            @NotBlank String table,
            @NotBlank String sourceId,
            @NotBlank String column,
            String originalValue,
            @NotBlank String reason,
            @NotBlank String requestedBy) {}
    @PostMapping("/gdpr/redact")
    public ResponseEntity<GdprRedactionService.RedactionRecord> redact(@Valid @RequestBody RedactRequest req) {
        return ResponseEntity.ok(redaction.redact(req.table(), req.sourceId(), req.column(),
                req.originalValue(), req.reason(), req.requestedBy()));
    }

    public record ExportRequest(@NotBlank String requestedBy, @Pattern(regexp = "soc2|iso|gdpr|all") String scope) {}
    @PostMapping("/audit/export")
    public ResponseEntity<AuditExportService.AuditExportResult> exportAudit(@Valid @RequestBody ExportRequest req) {
        return ResponseEntity.ok(export.export(req.requestedBy(), req.scope()));
    }

    @PostMapping("/explain/{sessionId}")
    public ResponseEntity<DecisionExplainerService.Explanation> explain(@PathVariable UUID sessionId) {
        return ResponseEntity.ok(explainer.explain(sessionId));
    }

    @GetMapping("/audit/verify")
    public ResponseEntity<Map<String, Object>> verify(@RequestParam long fromSeq, @RequestParam long toSeq,
                                                       @org.springframework.beans.factory.annotation.Autowired AuditChainService chain) {
        return ResponseEntity.ok(Map.of("verified", chain.verifyChainBetween(fromSeq, toSeq), "fromSeq", fromSeq, "toSeq", toSeq));
    }
}
