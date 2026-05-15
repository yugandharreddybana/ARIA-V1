package com.aria.repository;

import com.aria.model.ConceptEdge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ConceptEdgeRepository extends JpaRepository<ConceptEdge, String> {
    List<ConceptEdge> findByProjectIdAndWorkspaceId(String projectId, String workspaceId);
    List<ConceptEdge> findBySourceNodeId(String sourceNodeId);
    List<ConceptEdge> findByTargetNodeId(String targetNodeId);
}
