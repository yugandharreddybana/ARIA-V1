package com.aria.migration.controller;

import com.aria.migration.model.MigrationPhaseRun;
import com.aria.migration.model.MigrationPlaybook;
import com.aria.migration.service.MigrationOrchestratorService;
import com.aria.migration.service.MigrationOrchestratorService.PlaybookYaml;
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

    public record RegisterRequest(@NotBlank String name, @NotBlank String yaml, @NotBlank String signedBy) {}

    @PostMapping("/playbooks")
    public ResponseEntity<MigrationPlaybook> register(@RequestBody RegisterRequest req) {
        MigrationPlaybook saved = orchestrator.register(req.name(), req.yaml(), req.signedBy());
        // immediately queue phases by parsing the YAML once so the dashboard shows them
        PlaybookYaml parsed = PlaybookYaml.parse(req.yaml());
        orchestrator.queuePhases(saved.getId(), parsed.phases());
        return ResponseEntity.ok(saved);
    }

    @GetMapping("/playbooks/{id}/phases")
    public ResponseEntity<Map<String, Object>> phases(@PathVariable UUID id) {
        // No `runs` endpoint exposed here — phases are read via PhaseRunRepository inside the service.
        // For Sprint 9 we only return a status pointer; Sprint 14 wires the full executor.
        return ResponseEntity.ok(Map.of("playbookId", id, "message", "Phases queued. Use /api/migrations/run to execute."));
    }

    public record RunRequest(@NotBlank UUID playbookId) {}

    @PostMapping("/run")
    public ResponseEntity<List<MigrationPhaseRun>> run(@RequestBody RunRequest req) {
        // Default executor: noop (success).  Real DB DDL execution wires in Sprint 14.
        List<MigrationPhaseRun> after = orchestrator.run(
                req.playbookId(),
                phase -> { /* noop runner — Sprint 14 plugs in actual DDL exec */ },
                MigrationOrchestratorService.ALWAYS_OK);
        return ResponseEntity.ok(after);
    }
}
