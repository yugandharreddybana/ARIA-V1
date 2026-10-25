package com.aria.controller;

import com.aria.dto.analysis.AnalysisJobRequest;
import com.aria.dto.analysis.AnalysisJobResponse;
import com.aria.exception.AriaException;
import com.aria.service.AnalysisJobService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import com.aria.security.AriaAuthentication;
import com.aria.security.ProjectAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/analysis")
@RequiredArgsConstructor
public class AnalysisController {

    private final AnalysisJobService analysisJobService;

    @PostMapping("/jobs")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public AnalysisJobResponse createJob(
            @Valid @RequestBody AnalysisJobRequest request,
            @AuthenticationPrincipal AriaAuthentication auth) {
        return analysisJobService.createJob(request, ProjectAccess.require(auth).workspaceId());
    }

    @GetMapping("/jobs")
    public List<AnalysisJobResponse> listJobs(@AuthenticationPrincipal AriaAuthentication auth) {
        return analysisJobService.listJobs(ProjectAccess.require(auth).workspaceId());
    }

    @GetMapping("/jobs/{jobId}")
    public AnalysisJobResponse getJob(
            @PathVariable String jobId,
            @AuthenticationPrincipal AriaAuthentication auth) {
        return analysisJobService.getJob(jobId, ProjectAccess.require(auth).workspaceId());
    }
}
