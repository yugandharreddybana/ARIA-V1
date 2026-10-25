package com.aria.migration.controller;

import com.aria.migration.model.MigrationPhaseRun;
import com.aria.migration.model.MigrationPlaybook;
import com.aria.migration.service.MigrationOrchestratorService;
import com.aria.migration.service.MigrationOrchestratorService.PlaybookYaml;
import com.aria.security.AriaAuthentication;
import com.aria.security.ProjectAccess;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/migrations")
@RequiredArgsConstructor
public class MigrationController {

    private final MigrationOrchestratorService orchestrator;
    private final ProjectAccess access;

    public record RegisterRequest(@NotBlank String name, @NotBlank String yaml, @NotBlank String signedBy) {}

    @PostMapping("/playbooks")
    public ResponseEntity<MigrationPlaybook> register(
            @RequestBody RegisterRequest req,
            @AuthenticationPrincipal AriaAuthentication auth) {
        MigrationPlaybook saved = orchestrator.register(req.name(), req.yaml(), req.signedBy());
        access.stampUuid("migration_playbooks", saved.getId().toString(), ProjectAccess.require(auth).workspaceId());
        // immediately queue phases by parsing the YAML once so the dashboard shows them
        PlaybookYaml parsed = PlaybookYaml.parse(req.yaml());
        orchestrator.queuePhases(saved.getId(), parsed.phases());
        return ResponseEntity.ok(saved);
    }

    @GetMapping("/playbooks/{id}/phases")
    public ResponseEntity<Map<String, Object>> phases(
            @PathVariable UUID id,
            @AuthenticationPrincipal AriaAuthentication auth) {
        if (!access.owns("migration_playbooks", id.toString(), ProjectAccess.require(auth).workspaceId())) {
            return ResponseEntity.notFound().build();
        }
        // No `runs` endpoint exposed here — phases are read via PhaseRunRepository inside the service.
        // For Sprint 9 we only return a status pointer; Sprint 14 wires the full executor.
        return ResponseEntity.ok(Map.of("playbookId", id, "message", "Phases queued. Use /api/migrations/run to execute."));
    }

    public record RunRequest(@NotBlank UUID playbookId) {}

    @PostMapping("/run")
    public ResponseEntity<List<MigrationPhaseRun>> run(
            @RequestBody RunRequest req,
            @AuthenticationPrincipal AriaAuthentication auth) {
        if (!access.owns("migration_playbooks", req.playbookId().toString(), ProjectAccess.require(auth).workspaceId())) {
            return ResponseEntity.notFound().build();
        }
        // Default executor: noop (success).  Real DB DDL execution wires in Sprint 14.
        List<MigrationPhaseRun> after = orchestrator.run(
                req.playbookId(),
                phase -> { /* noop runner — Sprint 14 plugs in actual DDL exec */ },
                MigrationOrchestratorService.ALWAYS_OK);
        return ResponseEntity.ok(after);
    }
}
