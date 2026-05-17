package com.aria.graph.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record DistillRequest(
        @NotNull  UUID projectId,
        UUID sessionId,
        @NotBlank String agentId,
        @NotBlank String taskDescription,
        Integer maxAffectedSymbols,
        Integer maxModuleContext,
        Integer maxDomainConcepts,
        Integer maxDecisions
) {
    public int maxAffectedSymbolsOr(int d)  { return maxAffectedSymbols  != null ? maxAffectedSymbols  : d; }
    public int maxModuleContextOr(int d)    { return maxModuleContext    != null ? maxModuleContext    : d; }
    public int maxDomainConceptsOr(int d)   { return maxDomainConcepts   != null ? maxDomainConcepts   : d; }
    public int maxDecisionsOr(int d)        { return maxDecisions        != null ? maxDecisions        : d; }
}
