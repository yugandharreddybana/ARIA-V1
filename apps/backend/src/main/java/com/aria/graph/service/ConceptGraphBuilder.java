package com.aria.graph.service;

import com.aria.graph.model.SemanticChunk;
import com.aria.graph.repository.SemanticChunkRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * V27.9 §18N — Concept Graph Builder.
 *
 * Incremental: caller passes one file at a time (path + content + project + workspace).
 * We chunk, embed/summarise each chunk through the EmbeddingClient (which is gateway-routed),
 * and upsert the rows. Sprint 8 only fills Level 1 (symbols); Levels 2 / 3 / 4 are wired up
 * via `concept_nodes.graph_level` + `concept_edges.graph_level` so the schema is ready when
 * Sprint 10 (fleet) and Sprint 17 (meta-evolution) populate the higher levels.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ConceptGraphBuilder {

    private final SemanticChunker chunker;
    private final SemanticChunkRepository chunks;
    private final EmbeddingClient embedding;

    /**
     * Process one file end-to-end:
     *   1) compute content SHA + chunk by structure
     *   2) for each chunk → summarise + embed → upsert
     * Returns the number of chunks persisted for this file (after dedup against version_hash).
     */
    @Transactional
    public int ingestFile(UUID projectId, UUID workspaceId, String repoRelPath, String content) {
        List<SemanticChunk> fresh = chunker.chunk(projectId, workspaceId, repoRelPath, content);
        if (fresh.isEmpty()) return 0;

        // Stale check: if every existing chunk has the same versionHash, skip work entirely.
        String contentHash = fresh.get(0).getVersionHash();
        List<SemanticChunk> existing = chunks.findByProjectIdAndSourceFile(projectId, repoRelPath);
        if (!existing.isEmpty() && existing.stream().allMatch(c -> contentHash.equals(c.getVersionHash()))) {
            log.debug("Concept graph: skipping {} (version hash unchanged)", repoRelPath);
            return existing.size();
        }

        // Delete old chunks for this file — they're stale.
        if (!existing.isEmpty()) chunks.deleteAll(existing);

        int saved = 0;
        for (SemanticChunk chunk : fresh) {
            String snippet = (chunk.getSymbolName() != null ? chunk.getSymbolName() : "") +
                             " in " + repoRelPath + " (lines " + chunk.getLineStart() + "-" + chunk.getLineEnd() + ")";
            chunk.setSummary(embedding.summarise(snippet, "language=" + chunk.getSourceLanguage()));
            SemanticChunk persisted = chunks.save(chunk);

            float[] vec = embedding.embed(persisted.getSummary().isEmpty() ? snippet : persisted.getSummary());
            if (vec.length > 0) {
                chunks.updateEmbedding(persisted.getId(), EmbeddingClient.toVectorLiteral(vec));
            }
            saved++;
        }
        return saved;
    }
}
