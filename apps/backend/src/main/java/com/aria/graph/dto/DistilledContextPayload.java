package com.aria.graph.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * V27.9 §18N — Distilled Context Payload returned by the DistillationEngine.
 * Designed to slot into the Needle-Threading prompt assembly order:
 *   task_core (caller) → affected_symbols → module_context → domain_concepts
 *   → governing_decisions → experience_notes → anti_patterns
 * with critical instructions appended at the end by the caller.
 */
public record DistilledContextPayload(
        UUID taskId,
        String agentId,
        Instant distillationTimestamp,
        int totalTokensEstimated,
        int rawTokensWouldHaveBeen,
        double compressionRatio,
        List<SymbolBrief> affectedSymbols,
        List<ModuleBrief> moduleContext,
        List<DomainBrief> domainConcepts,
        List<DecisionBrief> governingDecisions,
        List<String> experienceNotes,
        List<String> antiPatterns,
        long durationMs
) {
    public record SymbolBrief(String symbol, String summary, String filePath, Integer lineStart, Integer lineEnd) {}
    public record ModuleBrief(String module, String summary) {}
    public record DomainBrief(String concept, String summary) {}
    public record DecisionBrief(String adrId, String title, String summary) {}
}
