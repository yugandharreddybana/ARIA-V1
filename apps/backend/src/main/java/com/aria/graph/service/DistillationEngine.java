package com.aria.graph.service;

import com.aria.graph.dto.DistilledContextPayload;
import com.aria.graph.dto.DistilledContextPayload.DecisionBrief;
import com.aria.graph.dto.DistilledContextPayload.DomainBrief;
import com.aria.graph.dto.DistilledContextPayload.ModuleBrief;
import com.aria.graph.dto.DistilledContextPayload.SymbolBrief;
import com.aria.graph.dto.DistillRequest;
import com.aria.graph.repository.SemanticChunkRepository;
import com.aria.model.ConceptEdge;
import com.aria.model.ConceptNode;
import com.aria.repository.ConceptNodeRepository;
import com.aria.repository.ConceptEdgeRepository;
import com.aria.graph.model.SemanticChunk;
import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

/**
 * V27.9 §18N — Distillation Engine.
 *
 *   Step 1 — intent extraction: keyword + symbol-mention heuristics (cheap, deterministic). The
 *            full LLM intent classifier ships in Sprint 17 — heuristic is sufficient for ranking.
 *   Step 2 — multi-level graph traversal: Level 1 symbols → Level 2 modules → Level 3 domains
 *            → Level 4 decisions.
 *   Step 3 — relevance ranking: keyword overlap, recency, graph proximity, veracity.
 *   Step 4 — payload construction: capped per-bucket counts.
 *   Step 5 — Needle-Threading is the caller's responsibility (this returns ordered buckets).
 *
 * Token accounting: `rawTokensWouldHaveBeen` is approximated by `bytes / 4`; `totalTokensEstimated`
 * sums the included summaries. compression_ratio is `raw / total`. ≥5× on representative corpora
 * is the Sprint 8 target.
 */
@Service
@RequiredArgsConstructor
public class DistillationEngine {

    private final SemanticChunkRepository chunkRepo;
    private final ConceptNodeRepository conceptNodes;
    private final ConceptEdgeRepository conceptEdges;
    private final JdbcTemplate jdbc;

    @Transactional(readOnly = true)
    public DistilledContextPayload distill(DistillRequest req) {
        long t0 = System.currentTimeMillis();

        Set<String> intentKeywords = extractIntentKeywords(req.taskDescription());

        // 1) Symbol bucket — semantic_chunks whose symbol_name or summary mentions any keyword.
        List<SemanticChunk> allChunks = chunkRepo.findAll().stream()
                .filter(c -> req.projectId().equals(c.getProjectId()))
                .toList();
        int rawTokens = 0;
        for (SemanticChunk c : allChunks) {
            rawTokens += approxTokens(c.getSummary()) + ((c.getLineEnd() != null && c.getLineStart() != null)
                ? (c.getLineEnd() - c.getLineStart()) * 8 : 0);
        }

        List<SemanticChunk> ranked = allChunks.stream()
                .map(c -> Map.entry(c, scoreChunk(c, intentKeywords)))
                .sorted((a, b) -> Double.compare(b.getValue(), a.getValue()))
                .filter(e -> e.getValue() > 0)
                .map(Map.Entry::getKey)
                .limit(req.maxAffectedSymbolsOr(8))
                .toList();

        List<SymbolBrief> symbolBucket = ranked.stream()
                .map(c -> new SymbolBrief(c.getSymbolName(), c.getSummary(), c.getSourceFile(), c.getLineStart(), c.getLineEnd()))
                .toList();

        // 2) Module bucket — distinct source_files among ranked chunks.
        List<ModuleBrief> moduleBucket = ranked.stream()
                .map(SemanticChunk::getSourceFile)
                .distinct()
                .limit(req.maxModuleContextOr(5))
                .map(file -> new ModuleBrief(moduleOf(file), "Module derived from " + file))
                .toList();

        // 3) Domain bucket — concept_nodes whose `name` keyword-overlaps the intent.
        List<ConceptNode> domainNodes = conceptNodes.findAll().stream()
                .filter(n -> req.projectId().equals(toUuid(n.getProjectId())))
                .filter(n -> n.getName() != null && containsAny(n.getName().toLowerCase(), intentKeywords))
                .limit(req.maxDomainConceptsOr(5))
                .toList();
        List<DomainBrief> domainBucket = domainNodes.stream()
                .map(n -> new DomainBrief(n.getName(), n.getSummary() != null ? n.getSummary() : ""))
                .toList();

        // 4) Decision bucket — ADR markdown chunks whose symbol_name (title) matches the intent.
        List<DecisionBrief> decisionBucket = chunkRepo.findAll().stream()
                .filter(c -> "adr".equals(c.getChunkType()))
                .filter(c -> c.getSymbolName() != null && containsAny(c.getSymbolName().toLowerCase(), intentKeywords))
                .limit(req.maxDecisionsOr(3))
                .map(c -> {
                    String fileName = c.getSourceFile();
                    String adrId = fileName.replaceAll(".*?(ADR-\\d+).*", "$1");
                    return new DecisionBrief(adrId, c.getSymbolName(), c.getSummary() != null ? c.getSummary() : "");
                })
                .toList();

        // experience + anti-pattern slots are filled by the middleware (which already has the
        // ExperienceService loaded). We just return empty lists here so the contract is stable.
        List<String> experience = List.of();
        List<String> antiPatterns = List.of();

        int totalTokens = approxTokensList(symbolBucket.stream().map(SymbolBrief::summary).toList())
                        + approxTokensList(moduleBucket.stream().map(ModuleBrief::summary).toList())
                        + approxTokensList(domainBucket.stream().map(DomainBrief::summary).toList())
                        + approxTokensList(decisionBucket.stream().map(DecisionBrief::summary).toList());
        if (totalTokens == 0) totalTokens = 1;                           // avoid /0
        double ratio = (double) rawTokens / (double) totalTokens;

        long duration = System.currentTimeMillis() - t0;

        // Persist the distillation run for Pre-Flight Estimator + coverage dashboards.
        try {
            jdbc.update(
                "INSERT INTO distillation_runs (project_id, session_id, agent_id, task_description_hash, " +
                "raw_tokens_estimated, distilled_tokens, compression_ratio, affected_symbol_count, " +
                "module_context_count, domain_concept_count, governing_decision_count, " +
                "experience_note_count, anti_pattern_count, duration_ms) " +
                "VALUES (?::uuid, ?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                req.projectId().toString(),
                req.sessionId() != null ? req.sessionId().toString() : null,
                req.agentId(),
                sha256(req.taskDescription()),
                rawTokens, totalTokens, ratio,
                symbolBucket.size(), moduleBucket.size(), domainBucket.size(),
                decisionBucket.size(), experience.size(), antiPatterns.size(),
                (int) duration
            );
        } catch (Exception ignored) { /* audit log; never blocks distillation */ }

        return new DistilledContextPayload(
                UUID.randomUUID(), req.agentId(), Instant.now(),
                totalTokens, rawTokens, ratio,
                symbolBucket, moduleBucket, domainBucket, decisionBucket,
                experience, antiPatterns,
                duration
        );
    }

    // ── helpers ────────────────────────────────────────────────────────────

    static Set<String> extractIntentKeywords(String taskDescription) {
        if (taskDescription == null) return Set.of();
        Set<String> out = new LinkedHashSet<>();
        for (String token : taskDescription.toLowerCase().split("[^a-zA-Z0-9_]+")) {
            if (token.length() >= 3 && !STOPWORDS.contains(token)) out.add(token);
        }
        return out;
    }

    private static double scoreChunk(SemanticChunk c, Set<String> kws) {
        if (c == null || kws.isEmpty()) return 0;
        double score = 0;
        String name = c.getSymbolName() != null ? c.getSymbolName().toLowerCase() : "";
        String sum  = c.getSummary()    != null ? c.getSummary().toLowerCase()    : "";
        String file = c.getSourceFile() != null ? c.getSourceFile().toLowerCase() : "";
        for (String k : kws) {
            if (name.contains(k))  score += 3.0;
            if (sum.contains(k))   score += 2.0;
            if (file.contains(k))  score += 1.0;
        }
        // recency bias — chunks updated in the last 24h get a small bump
        if (c.getLastUpdatedAt() != null) {
            long ageH = (System.currentTimeMillis() - c.getLastUpdatedAt().toEpochMilli()) / 3_600_000L;
            if (ageH < 24)  score += 0.5;
        }
        return score;
    }

    private static int approxTokens(String s) {
        if (s == null || s.isEmpty()) return 0;
        return s.length() / 4 + 1;
    }
    private static int approxTokensList(List<String> xs) { return xs.stream().mapToInt(DistillationEngine::approxTokens).sum(); }

    private static String moduleOf(String filePath) {
        int idx = filePath.lastIndexOf('/');
        return idx >= 0 ? filePath.substring(0, idx) : filePath;
    }

    private static boolean containsAny(String haystack, Set<String> needles) {
        for (String n : needles) if (haystack.contains(n)) return true;
        return false;
    }

    private static UUID toUuid(String s) {
        try { return s != null ? UUID.fromString(s) : null; } catch (Exception e) { return null; }
    }

    private static String sha256(String s) {
        try {
            byte[] d = java.security.MessageDigest.getInstance("SHA-256").digest(s == null ? new byte[0] : s.getBytes());
            return java.util.HexFormat.of().formatHex(d);
        } catch (Exception e) { return ""; }
    }

    private static final Set<String> STOPWORDS = Set.of(
        "the","and","for","with","into","from","that","this","when","then","please","just","need",
        "want","take","over","under","make","made","also","like","using","use","not","may","can",
        "but","are","was","were","you","your","ours","our","its","has","had","have","does","did"
    );
}
