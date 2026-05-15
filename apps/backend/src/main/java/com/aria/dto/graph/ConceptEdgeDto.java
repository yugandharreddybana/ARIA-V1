package com.aria.dto.graph;

import java.time.Instant;

public record ConceptEdgeDto(
        String id,
        String projectId,
        String sourceNodeId,
        String targetNodeId,
        String edgeType,
        String label,
        Double confidence,
        Instant createdAt
) {}
