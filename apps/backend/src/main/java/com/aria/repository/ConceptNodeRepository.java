package com.aria.repository;

import com.aria.model.ConceptNode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface ConceptNodeRepository extends JpaRepository<ConceptNode, String> {
    List<ConceptNode> findByProjectIdAndWorkspaceId(String projectId, String workspaceId);

    @Query("SELECT n FROM ConceptNode n WHERE n.projectId = :projectId AND n.workspaceId = :workspaceId AND n.nodeType = :nodeType")
    List<ConceptNode> findByProjectAndType(@Param("projectId") String projectId,
                                           @Param("workspaceId") String workspaceId,
                                           @Param("nodeType") String nodeType);
}
