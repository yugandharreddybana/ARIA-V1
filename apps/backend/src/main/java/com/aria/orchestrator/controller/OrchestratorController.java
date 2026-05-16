package com.aria.orchestrator.controller;

import com.aria.exception.AriaException;
import com.aria.orchestrator.dto.CreateSessionRequest;
import com.aria.orchestrator.dto.SessionDto;
import com.aria.orchestrator.service.OrchestratorService;
import com.aria.security.AriaAuthentication;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/orchestrator")
@RequiredArgsConstructor
public class OrchestratorController {

    private final OrchestratorService service;

    @PostMapping("/sessions")
    public ResponseEntity<SessionDto> create(@Valid @RequestBody CreateSessionRequest req) {
        return ResponseEntity.ok(service.create(req, userId()));
    }

    @PostMapping("/sessions/{id}/start")
    public ResponseEntity<SessionDto> start(@PathVariable UUID id) {
        return ResponseEntity.ok(service.start(id, userId()));
    }

    @PostMapping("/sessions/{id}/pause")
    public ResponseEntity<SessionDto> pause(@PathVariable UUID id) {
        return ResponseEntity.ok(service.pause(id, userId()));
    }

    @PostMapping("/sessions/{id}/stop")
    public ResponseEntity<SessionDto> stop(@PathVariable UUID id) {
        return ResponseEntity.ok(service.stop(id, userId()));
    }

    @GetMapping("/sessions/{id}/status")
    public ResponseEntity<SessionDto> status(@PathVariable UUID id) {
        return ResponseEntity.ok(service.status(id, userId()));
    }

    /** Pull the authenticated userId from Spring SecurityContext. */
    private UUID userId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof AriaAuthentication aa) || aa.userId() == null) {
            throw AriaException.unauthorized("Authentication required");
        }
        try {
            return UUID.fromString(aa.userId());
        } catch (IllegalArgumentException ex) {
            throw AriaException.unauthorized("Invalid user identity");
        }
    }
}
