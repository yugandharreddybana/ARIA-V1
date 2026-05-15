package com.aria.dto.graph;

import java.util.List;

public record ConceptGraphResponse(
        String projectId,
        List<ConceptNodeDto> nodes,
        List<ConceptEdgeDto> edges,
        GraphMeta meta
) {
    public record GraphMeta(
            int nodeCount,
            int edgeCount,
            String status  // empty | partial | complete
    ) {}
}
