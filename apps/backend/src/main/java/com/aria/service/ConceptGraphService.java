package com.aria.service;

import com.aria.dto.graph.*;
import com.aria.model.ConceptEdge;
import com.aria.model.ConceptNode;
import com.aria.repository.ConceptEdgeRepository;
import com.aria.repository.ConceptNodeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ConceptGraphService {

    private final ConceptNodeRepository nodeRepo;
    private final ConceptEdgeRepository edgeRepo;

    @Transactional(readOnly = true)
    public ConceptGraphResponse getGraph(String projectId, String workspaceId) {
        List<ConceptNode> nodes = nodeRepo.findByProjectIdAndWorkspaceId(projectId, workspaceId);
        List<ConceptEdge> edges = edgeRepo.findByProjectIdAndWorkspaceId(projectId, workspaceId);

        List<ConceptNodeDto> nodeDtos = nodes.stream().map(this::toNodeDto).toList();
        List<ConceptEdgeDto> edgeDtos = edges.stream().map(this::toEdgeDto).toList();

        String status = nodes.isEmpty() ? "empty" : "partial";
        return new ConceptGraphResponse(
                projectId, nodeDtos, edgeDtos,
                new ConceptGraphResponse.GraphMeta(nodeDtos.size(), edgeDtos.size(), status)
        );
    }

    @Transactional
    public ConceptNode saveNode(ConceptNode node) {
        return nodeRepo.save(node);
    }

    @Transactional
    public ConceptEdge saveEdge(ConceptEdge edge) {
        return edgeRepo.save(edge);
    }

    @Transactional
    public void clearGraph(String projectId, String workspaceId) {
        edgeRepo.deleteAll(edgeRepo.findByProjectIdAndWorkspaceId(projectId, workspaceId));
        nodeRepo.deleteAll(nodeRepo.findByProjectIdAndWorkspaceId(projectId, workspaceId));
        log.info("Cleared concept graph for project {}", projectId);
    }

    private ConceptNodeDto toNodeDto(ConceptNode n) {
        return new ConceptNodeDto(
                n.getId(), n.getProjectId(), n.getNodeType(),
                n.getName(), n.getFilePath(), n.getSummary(),
                n.getMetadata(), n.getCreatedAt(), n.getUpdatedAt()
        );
    }

    private ConceptEdgeDto toEdgeDto(ConceptEdge e) {
        return new ConceptEdgeDto(
                e.getId(), e.getProjectId(),
                e.getSourceNode().getId(), e.getTargetNode().getId(),
                e.getEdgeType(), e.getLabel(), e.getConfidence(), e.getCreatedAt()
        );
    }
}
