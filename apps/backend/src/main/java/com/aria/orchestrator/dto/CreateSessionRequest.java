package com.aria.orchestrator.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

import java.util.UUID;

public record CreateSessionRequest(
        @NotNull UUID projectId,
        @Pattern(regexp = "precision|throughput|planning|shadow") String mode,
        @Pattern(regexp = "dev|staging|prod_readonly|production") String environment,
        @Pattern(regexp = "stability|feature|tech_debt|security|planning") String missionType,
        Integer tokenBudget,
        Integer timeBudgetMinutes
) {}
