package com.aria.graph.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * V27.9 §18N — Level-1 semantic chunk emitted by the SemanticChunker.
 *
 * Stored in the `semantic_chunks` table; `chunk_type` is TEXT with CHECK constraint at the DB
 * (same pattern as Session — keeps Hibernate happy without custom Postgres-enum converters).
 *
 * `embedding` is `vector(768)` (Ollama nomic-embed-text dimension). Sprint 8 writes vectors
 * through the EmbeddingClient (which goes through the Token Gateway); the column is mapped as
 * a raw String here so the entity does not need a pgvector-specific Hibernate type. Read/write
 * helpers in `SemanticChunkRepository` use native queries when the actual vector is needed.
 */
@Entity
@Table(name = "semantic_chunks")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SemanticChunk {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(name = "project_id", nullable = false)
    private UUID projectId;

    @Column(name = "workspace_id", nullable = false)
    private UUID workspaceId;

    @Column(name = "source_file", nullable = false, length = 1000)
    private String sourceFile;

    @Column(name = "source_language", nullable = false, length = 40)
    private String sourceLanguage;

    @Column(name = "chunk_type", nullable = false, length = 32)
    private String chunkType;

    @Column(name = "symbol_name", length = 500)
    private String symbolName;

    @Column(name = "line_start")
    private Integer lineStart;

    @Column(name = "line_end")
    private Integer lineEnd;

    @Column(name = "dependencies", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private String dependencies = "[]";

    @Column(name = "dependents", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private String dependents = "[]";

    @Column(name = "summary", columnDefinition = "TEXT")
    private String summary;

    /**
     * Raw string projection of the pgvector column. Reads `null` when no vector has been
     * computed yet; writes go through `SemanticChunkRepository.updateEmbedding(...)`.
     */
    @Column(name = "embedding", insertable = false, updatable = false, columnDefinition = "vector")
    private String embedding;

    @Column(name = "version_hash", nullable = false, length = 64)
    private String versionHash;

    @CreationTimestamp
    @UpdateTimestamp
    @Column(name = "last_updated_at", nullable = false)
    private Instant lastUpdatedAt;
}
