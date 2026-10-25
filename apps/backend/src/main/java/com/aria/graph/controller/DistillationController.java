package com.aria.graph.controller;

import com.aria.graph.dto.DistillRequest;
import com.aria.graph.dto.DistilledContextPayload;
import com.aria.graph.service.ConceptGraphBuilder;
import com.aria.graph.service.DistillationEngine;
import com.aria.graph.repository.SemanticChunkRepository;
import com.aria.security.AriaAuthentication;
import com.aria.security.ProjectAccess;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * V27.9 §18N controllers — distillation + graph admin endpoints.
 *
 *   POST /api/distill                         → DistilledContextPayload
 *   POST /api/graph/rebuild                    → upsert one file into the Concept Graph
 *   GET  /api/graph/coverage/{projectId}       → coverage metrics for the Knowledge Graph Architect
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class DistillationController {

    private final DistillationEngine engine;
    private final ConceptGraphBuilder builder;
    private final SemanticChunkRepository chunks;
    private final ProjectAccess access;

    @PostMapping("/distill")
    public ResponseEntity<DistilledContextPayload> distill(
            @Valid @RequestBody DistillRequest req,
            @AuthenticationPrincipal AriaAuthentication auth) {
        AriaAuthentication caller = ProjectAccess.require(auth);
        access.assertProject(req.projectId().toString(), caller.workspaceId());
        return ResponseEntity.ok(engine.distill(req));
    }

    public record RebuildRequest(UUID projectId, String path, String content) {}

    @PostMapping("/graph/rebuild")
    public ResponseEntity<Map<String, Object>> rebuild(
            @RequestBody RebuildRequest req,
            @AuthenticationPrincipal AriaAuthentication auth) {
        AriaAuthentication caller = ProjectAccess.require(auth);
        access.assertProject(req.projectId().toString(), caller.workspaceId());
        int saved = builder.ingestFile(req.projectId(), UUID.fromString(caller.workspaceId()), req.path(), req.content());
        return ResponseEntity.ok(Map.of("path", req.path(), "chunks_saved", saved));
    }

    @GetMapping("/graph/coverage/{projectId}")
    public ResponseEntity<Map<String, Object>> coverage(
            @PathVariable UUID projectId,
            @AuthenticationPrincipal AriaAuthentication auth) {
        AriaAuthentication caller = ProjectAccess.require(auth);
        access.assertProject(projectId.toString(), caller.workspaceId());
        UUID workspaceId = UUID.fromString(caller.workspaceId());
        long total       = chunks.countByProjectIdAndWorkspaceId(projectId, workspaceId);
        long summarised  = chunks.countSummarisedByProjectIdAndWorkspaceId(projectId, workspaceId);
        long embedded    = chunks.countEmbeddedByProjectIdAndWorkspaceId(projectId, workspaceId);
        double pctSummary = total > 0 ? (double) summarised / total : 0.0;
        double pctVector  = total > 0 ? (double) embedded / total : 0.0;
        return ResponseEntity.ok(Map.of(
            "project_id",                 projectId.toString(),
            "symbols_total",              total,
            "symbols_with_summary",       summarised,
            "symbols_with_embedding",     embedded,
            "summary_coverage_pct",       Math.round(pctSummary * 1000.0) / 10.0,
            "embedding_coverage_pct",     Math.round(pctVector  * 1000.0) / 10.0,
            "coverage_target_pct",        95.0
        ));
    }
}
