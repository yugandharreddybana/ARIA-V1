package com.aria.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;

@Entity
@Table(name = "concept_edges",
        indexes = {
                @Index(name = "idx_concept_edges_project", columnList = "project_id"),
                @Index(name = "idx_concept_edges_source", columnList = "source_node_id"),
                @Index(name = "idx_concept_edges_target", columnList = "target_node_id")
        })
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConceptEdge {

    @Id
    @Column(nullable = false, updatable = false)
    private String id;

    @Column(name = "project_id", nullable = false)
    private String projectId;

    @Column(name = "workspace_id", nullable = false)
    private String workspaceId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "source_node_id", nullable = false)
    private ConceptNode sourceNode;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_node_id", nullable = false)
    private ConceptNode targetNode;

    /**
     * calls | queries | owns | depends_on | imports | extends | implements | triggers
     */
    @Column(name = "edge_type", nullable = false)
    private String edgeType;

    /** Human-readable label, e.g. "GET /api/users" */
    @Column
    private String label;

    /** 0.0 - 1.0 confidence score from analysis engine */
    @Column
    private Double confidence;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}
