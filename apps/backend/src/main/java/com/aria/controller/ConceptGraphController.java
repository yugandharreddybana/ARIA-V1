package com.aria.controller;

import com.aria.dto.graph.ConceptGraphResponse;
import com.aria.security.AriaAuthentication;
import com.aria.service.ConceptGraphService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/concept-graph")
@RequiredArgsConstructor
public class ConceptGraphController {

    private final ConceptGraphService conceptGraphService;

    @GetMapping("/projects/{projectId}")
    public ConceptGraphResponse getGraph(
            @PathVariable String projectId,
            @AuthenticationPrincipal AriaAuthentication auth) {
        return conceptGraphService.getGraph(projectId, auth.workspaceId());
    }

    @DeleteMapping("/projects/{projectId}")
    public void clearGraph(
            @PathVariable String projectId,
            @AuthenticationPrincipal AriaAuthentication auth) {
        conceptGraphService.clearGraph(projectId, auth.workspaceId());
    }
}
