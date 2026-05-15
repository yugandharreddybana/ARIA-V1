package com.aria.dto.analysis;

import jakarta.validation.constraints.NotBlank;

public record AnalysisJobRequest(
        @NotBlank String projectId,
        @NotBlank String repoId,
        @NotBlank String repoUrl,
        @NotBlank String branch,
        @NotBlank String workspaceId
) {}
