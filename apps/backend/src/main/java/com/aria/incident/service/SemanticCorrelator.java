package com.aria.incident.service;

import com.aria.graph.model.SemanticChunk;
import com.aria.graph.repository.SemanticChunkRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * V27.9 §17 — Incident ↔ Concept Graph correlator.
 *
 * Given an incident title + description, extract keywords, score `semantic_chunks`, and return
 * the top-N file paths most likely responsible. Sprint 14 Replay Engine then opens those files
 * for the Precision-session agent.
 */
@Service
@RequiredArgsConstructor
public class SemanticCorrelator {

    private final SemanticChunkRepository chunks;

    @Transactional(readOnly = true)
    public List<String> correlate(UUID projectId, String text, int limit) {
        if (projectId == null || text == null || text.isBlank()) return List.of();
        // Reuse DistillationEngine keyword extraction logic — duplicated here to avoid coupling
        // the incident package on the graph engine.
        java.util.Set<String> kws = new java.util.LinkedHashSet<>();
        for (String tok : text.toLowerCase().split("[^a-zA-Z0-9_]+")) {
            if (tok.length() >= 3 && !STOPWORDS.contains(tok)) kws.add(tok);
        }
        if (kws.isEmpty()) return List.of();

        return chunks.findAll().stream()
                .filter(c -> projectId.equals(c.getProjectId()))
                .map(c -> java.util.Map.entry(c, score(c, kws)))
                .filter(e -> e.getValue() > 0)
                .sorted((a, b) -> Double.compare(b.getValue(), a.getValue()))
                .limit(limit)
                .map(e -> e.getKey().getSourceFile())
                .distinct()
                .collect(Collectors.toList());
    }

    private static double score(SemanticChunk c, java.util.Set<String> kws) {
        String name = c.getSymbolName() != null ? c.getSymbolName().toLowerCase() : "";
        String sum  = c.getSummary()    != null ? c.getSummary().toLowerCase()    : "";
        String file = c.getSourceFile() != null ? c.getSourceFile().toLowerCase() : "";
        double s = 0;
        for (String k : kws) {
            if (name.contains(k)) s += 3.0;
            if (sum.contains(k))  s += 2.0;
            if (file.contains(k)) s += 1.0;
        }
        return s;
    }

    private static final java.util.Set<String> STOPWORDS = java.util.Set.of(
        "the","and","for","with","into","from","that","this","when","then","please","just","need",
        "want","take","over","under","make","made","also","like","using","use","not","may","can",
        "but","are","was","were","you","your","ours","our","its","has","had","have","does","did",
        "incident","error","fail","failed","p0","p1","p2","p3"
    );
}
