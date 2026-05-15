package com.aria.dto.graph;

import java.time.Instant;

public record ConceptNodeDto(
        String id,
        String projectId,
        String nodeType,
        String name,
        String filePath,
        String summary,
        String metadata,
        Instant createdAt,
        Instant updatedAt
) {}
