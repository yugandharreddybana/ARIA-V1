package com.aria.incident.controller;

import com.aria.incident.dto.DeclareIncidentRequest;
import com.aria.incident.model.Incident;
import com.aria.incident.service.IncidentCommanderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * V27.9 §17 — Incident Commander REST surface.
 *   POST   /api/incidents                      declare new incident
 *   GET    /api/incidents                      list 20 most recent
 *   GET    /api/incidents/{id}                 fetch by id
 *   POST   /api/incidents/{id}/transition      move through the state machine
 */
@RestController
@RequestMapping("/api/incidents")
@RequiredArgsConstructor
public class IncidentController {

    private final IncidentCommanderService commander;

    @PostMapping
    public ResponseEntity<Incident> declare(@Valid @RequestBody DeclareIncidentRequest req) {
        return ResponseEntity.ok(commander.declare(
                req.source(), req.severity(), req.title(), req.description(),
                req.relatedSessionId(), req.relatedCommits()));
    }

    @GetMapping
    public ResponseEntity<List<Incident>> list() {
        return ResponseEntity.ok(commander.recent());
    }

    @GetMapping("/{id}")
    public ResponseEntity<Incident> get(@PathVariable UUID id) {
        Incident inc = commander.getById(id);
        return inc == null ? ResponseEntity.notFound().build() : ResponseEntity.ok(inc);
    }

    public record TransitionRequest(String to) {}

    @PostMapping("/{id}/transition")
    public ResponseEntity<?> transition(@PathVariable UUID id, @RequestBody TransitionRequest req) {
        try {
            return ResponseEntity.ok(commander.transition(id, req.to()));
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest().body(Map.of("code", "INVALID_TRANSITION", "message", e.getMessage()));
        }
    }
}
