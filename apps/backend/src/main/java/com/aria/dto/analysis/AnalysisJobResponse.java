package com.aria.dto.analysis;

import java.time.Instant;

public record AnalysisJobResponse(
        String jobId,
        String projectId,
        String repoId,
        String repoUrl,
        String branch,
        String workspaceId,
        String status,
        Instant createdAt,
        Instant updatedAt
) {}
