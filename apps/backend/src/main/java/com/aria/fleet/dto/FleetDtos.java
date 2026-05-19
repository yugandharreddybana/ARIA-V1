package com.aria.fleet.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.UUID;

public final class FleetDtos {

    private FleetDtos() {}

    public record RegisterAgentRequest(
            @NotBlank String agentId,
            @NotBlank String agentFamily
    ) {}

    public record PublishEventRequest(
            @NotBlank String epicId,
            @NotBlank String topic,
            @NotBlank String payload,
            @NotBlank String agentId,
            @NotBlank String signature
    ) {}

    public record HeartbeatRequest(
            @NotBlank String agentId,
            UUID sessionId,
            String skillSlug,
            @NotBlank String state,
            String waitingOn,
            java.time.Instant waitingSince,
            java.time.Instant lastOutputAt,
            Integer tokensConsumedIdle
    ) {}

    public record OpenShadowBranchRequest(
            @NotBlank String ticketRef,
            String speculativeDiff
    ) {}
}
