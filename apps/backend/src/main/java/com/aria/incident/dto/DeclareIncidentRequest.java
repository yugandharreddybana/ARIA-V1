package com.aria.incident.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.util.List;
import java.util.UUID;

public record DeclareIncidentRequest(
        @NotBlank String source,
        @Pattern(regexp = "P0|P1|P2|P3") String severity,
        @NotBlank String title,
        @NotBlank String description,
        UUID relatedSessionId,
        List<String> relatedCommits
) {}
