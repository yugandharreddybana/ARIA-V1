package com.aria.repository;

import com.aria.model.AnalysisJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AnalysisJobRepository extends JpaRepository<AnalysisJob, String> {
    List<AnalysisJob> findByWorkspaceIdOrderByCreatedAtDesc(String workspaceId);
    Optional<AnalysisJob> findByIdAndWorkspaceId(String id, String workspaceId);
}
