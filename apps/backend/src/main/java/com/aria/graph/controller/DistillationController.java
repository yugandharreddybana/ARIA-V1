package com.aria.graph.controller;

import com.aria.graph.dto.DistillRequest;
import com.aria.graph.dto.DistilledContextPayload;
import com.aria.graph.service.ConceptGraphBuilder;
import com.aria.graph.service.DistillationEngine;
import com.aria.graph.repository.SemanticChunkRepository;
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

    @PostMapping("/distill")
    public ResponseEntity<DistilledContextPayload> distill(@Valid @RequestBody DistillRequest req) {
        return ResponseEntity.ok(engine.distill(req));
    }

    public record RebuildRequest(UUID projectId, UUID workspaceId, String path, String content) {}

    @PostMapping("/graph/rebuild")
    public ResponseEntity<Map<String, Object>> rebuild(@RequestBody RebuildRequest req) {
        int saved = builder.ingestFile(req.projectId(), req.workspaceId(), req.path(), req.content());
        return ResponseEntity.ok(Map.of("path", req.path(), "chunks_saved", saved));
    }

    @GetMapping("/graph/coverage/{projectId}")
    public ResponseEntity<Map<String, Object>> coverage(@PathVariable UUID projectId) {
        long total       = chunks.countByProjectId(projectId);
        long summarised  = chunks.countSummarisedByProjectId(projectId);
        long embedded    = chunks.countEmbeddedByProjectId(projectId);
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
