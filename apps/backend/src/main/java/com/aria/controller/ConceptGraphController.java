package com.aria.controller;

import com.aria.dto.graph.ConceptGraphResponse;
import com.aria.security.AriaAuthentication;
import com.aria.security.ProjectAccess;
import com.aria.service.ConceptGraphService;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/concept-graph")
@RequiredArgsConstructor
public class ConceptGraphController {

    private final ConceptGraphService conceptGraphService;
    private final ProjectAccess access;

    @GetMapping("/projects/{projectId}")
    public ConceptGraphResponse getGraph(
            @PathVariable String projectId,
            @AuthenticationPrincipal AriaAuthentication auth) {
        AriaAuthentication caller = ProjectAccess.require(auth);
        access.assertProject(projectId, caller.workspaceId());
        return conceptGraphService.getGraph(projectId, caller.workspaceId());
    }

    @DeleteMapping("/projects/{projectId}")
    public void clearGraph(
            @PathVariable String projectId,
            @AuthenticationPrincipal AriaAuthentication auth) {
        AriaAuthentication caller = ProjectAccess.require(auth);
        access.assertProject(projectId, caller.workspaceId());
        conceptGraphService.clearGraph(projectId, caller.workspaceId());
    }
}
