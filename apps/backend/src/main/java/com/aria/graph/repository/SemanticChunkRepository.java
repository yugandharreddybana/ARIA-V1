package com.aria.graph.repository;

import com.aria.graph.model.SemanticChunk;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface SemanticChunkRepository extends JpaRepository<SemanticChunk, UUID> {

    List<SemanticChunk> findByProjectIdAndSourceFile(UUID projectId, String sourceFile);

    Optional<SemanticChunk> findByProjectIdAndSourceFileAndSymbolName(UUID projectId, String sourceFile, String symbolName);

    long countByProjectId(UUID projectId);

    @Query("SELECT COUNT(c) FROM SemanticChunk c WHERE c.projectId = :pid AND c.summary IS NOT NULL")
    long countSummarisedByProjectId(@Param("pid") UUID projectId);

    @Query("SELECT COUNT(c) FROM SemanticChunk c WHERE c.projectId = :pid AND c.embedding IS NOT NULL")
    long countEmbeddedByProjectId(@Param("pid") UUID projectId);

    /**
     * Native UPDATE that writes a pgvector literal into `embedding`. Using a native query keeps
     * the entity definition simple — no custom Hibernate type required.
     */
    @Modifying
    @Query(value = "UPDATE semantic_chunks SET embedding = CAST(:vec AS vector), last_updated_at = NOW() WHERE id = :id",
           nativeQuery = true)
    int updateEmbedding(@Param("id") UUID id, @Param("vec") String vectorLiteral);

    /** Top-K nearest neighbours by cosine distance over a query embedding. */
    @Query(value = "SELECT * FROM semantic_chunks WHERE project_id = :pid AND embedding IS NOT NULL " +
                   "ORDER BY embedding <=> CAST(:vec AS vector) LIMIT :k",
           nativeQuery = true)
    List<SemanticChunk> nearestNeighbours(@Param("pid") UUID projectId,
                                          @Param("vec") String vectorLiteral,
                                          @Param("k") int k);

    /** Chunks whose source file SHA differs from the value passed (stale-summary detection). */
    @Query("SELECT c FROM SemanticChunk c WHERE c.projectId = :pid AND c.versionHash <> :hash")
    List<SemanticChunk> findStaleByVersionHash(@Param("pid") UUID projectId, @Param("hash") String hash);
}
