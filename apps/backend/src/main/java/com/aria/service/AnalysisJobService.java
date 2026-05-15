package com.aria.service;

import com.aria.dto.analysis.AnalysisJobRequest;
import com.aria.dto.analysis.AnalysisJobResponse;
import com.aria.exception.AriaException;
import com.aria.model.AnalysisJob;
import com.aria.repository.AnalysisJobRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class AnalysisJobService {

    private final AnalysisJobRepository repo;

    public AnalysisJobResponse createJob(AnalysisJobRequest req, String workspaceId) {
        var job = AnalysisJob.builder()
                .id(UUID.randomUUID().toString())
                .projectId(req.projectId())
                .repoId(req.repoId())
                .repoUrl(req.repoUrl())
                .branch(req.branch())
                .workspaceId(workspaceId)
                .status("queued")
                .build();
        repo.save(job);
        log.info("Analysis job queued: {} for repo {}", job.getId(), req.repoUrl());
        return toResponse(job);
    }

    public List<AnalysisJobResponse> listJobs(String workspaceId) {
        return repo.findByWorkspaceIdOrderByCreatedAtDesc(workspaceId)
                .stream().map(this::toResponse).toList();
    }

    public AnalysisJobResponse getJob(String jobId, String workspaceId) {
        return repo.findByIdAndWorkspaceId(jobId, workspaceId)
                .map(this::toResponse)
                .orElseThrow(() -> AriaException.notFound("Analysis job not found"));
    }

    private AnalysisJobResponse toResponse(AnalysisJob j) {
        return new AnalysisJobResponse(
                j.getId(), j.getProjectId(), j.getRepoId(),
                j.getRepoUrl(), j.getBranch(), j.getWorkspaceId(),
                j.getStatus(), j.getCreatedAt(), j.getUpdatedAt()
        );
    }
}
