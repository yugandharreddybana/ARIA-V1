package com.aria.orchestrator.dto;

import com.aria.orchestrator.model.Session;

import java.time.Instant;
import java.util.UUID;

public record SessionDto(
        UUID id,
        UUID projectId,
        UUID workspaceId,
        UUID userId,
        String state,
        String mode,
        String environment,
        String missionType,
        Integer tokenBudget,
        Integer timeBudgetMinutes,
        Instant startedAt,
        Instant endedAt
) {
    public static SessionDto from(Session s) {
        return new SessionDto(
                s.getId(),
                s.getProjectId(),
                s.getWorkspaceId(),
                s.getUserId(),
                s.getState(),
                s.getMode(),
                s.getEnvironment(),
                s.getMissionType(),
                s.getTokenBudget(),
                s.getTimeBudgetMinutes(),
                s.getStartedAt(),
                s.getEndedAt()
        );
    }
}
