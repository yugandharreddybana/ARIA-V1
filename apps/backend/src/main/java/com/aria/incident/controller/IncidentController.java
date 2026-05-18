package com.aria.incident.controller;

import com.aria.incident.dto.DeclareIncidentRequest;
import com.aria.incident.model.Incident;
import com.aria.incident.service.IncidentCommanderService;
import com.aria.incident.service.IncidentResponder;
import com.aria.security.AriaAuthentication;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * V27.9 §17 — Incident Commander REST surface.
 *
 *   POST  /api/incidents                       declare + auto-escalate on P0/P1
 *   GET   /api/incidents                       list 20 most recent
 *   GET   /api/incidents/{id}                  fetch by id
 *   POST  /api/incidents/{id}/transition       move through the state machine
 *   POST  /api/incidents/{id}/escalate         re-run the responder manually
 */
@RestController
@RequestMapping("/api/incidents")
@RequiredArgsConstructor
public class IncidentController {

    private final IncidentCommanderService commander;
    private final IncidentResponder responder;

    public record DeclareWithProject(
            @Valid DeclareIncidentRequest body,
            UUID relatedProjectId
    ) {}

    @PostMapping
    public ResponseEntity<Map<String, Object>> declare(@Valid @RequestBody DeclareIncidentRequest req) {
        Incident inc = commander.declare(
                req.source(), req.severity(), req.title(), req.description(),
                req.relatedSessionId(), req.relatedCommits());

        UUID actor = currentUserIdOrNull();
        IncidentResponder.EscalationResult esc = responder.escalate(inc, null, actor);

        return ResponseEntity.ok(Map.of(
                "incident", inc,
                "escalation", esc
        ));
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

    @PostMapping("/{id}/escalate")
    public ResponseEntity<?> escalate(@PathVariable UUID id, @RequestParam(required = false) UUID projectId) {
        Incident inc = commander.getById(id);
        if (inc == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(responder.escalate(inc, projectId, currentUserIdOrNull()));
    }

    private static UUID currentUserIdOrNull() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof AriaAuthentication aa && aa.userId() != null) {
            try { return UUID.fromString(aa.userId()); } catch (IllegalArgumentException e) { return null; }
        }
        return null;
    }
}
