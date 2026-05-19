package com.aria.incident.service;

import com.aria.incident.model.Incident;
import com.aria.incident.repository.IncidentRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * V27.9 §17 — Incident Commander.
 *
 * Sprint 9 scope: declare(), getById(), list(), transition().  The auto-correlation with
 * commits via GraphRAG (Sprint 8 Concept Graph) is wired but conservative — we record the
 * `related_commits` payload the caller supplies and link the affected session if any.
 *
 * Sprint 14 (Chaos Sandbox + Replay Engine) closes the loop by spawning a Precision-mode
 * session against the suspected commits and surfacing the auto-hotfix PR.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IncidentCommanderService {

    private final IncidentRepository incidents;

    @Transactional
    public Incident declare(String source, String severity, String title, String description,
                            UUID relatedSessionId, List<String> relatedCommits) {
        Incident inc = Incident.builder()
                .source(source)
                .severity(severity)
                .title(title)
                .description(description)
                .relatedSessionId(relatedSessionId)
                .relatedCommits(relatedCommits == null || relatedCommits.isEmpty() ? "[]" : toJson(relatedCommits))
                .status("open")
                .build();
        Incident saved = incidents.save(inc);
        log.warn("INCIDENT_DECLARED id={} severity={} source={} title={}",
                saved.getId(), severity, source, title);
        return saved;
    }

    @Transactional(readOnly = true)
    public Incident getById(UUID id) {
        return incidents.findById(id).orElse(null);
    }

    @Transactional(readOnly = true)
    public List<Incident> recent() {
        return incidents.findTop20ByOrderByDetectedAtDesc();
    }

    /** Allowed transitions: open → investigating → mitigated → resolved → postmortem. */
    @Transactional
    public Incident transition(UUID id, String to) {
        Incident inc = incidents.findById(id).orElseThrow();
        if (!isValid(inc.getStatus(), to)) {
            throw new IllegalStateException("Invalid transition " + inc.getStatus() + " → " + to);
        }
        inc.setStatus(to);
        if ("resolved".equals(to)) inc.setResolvedAt(Instant.now());
        return incidents.save(inc);
    }

    private static boolean isValid(String from, String to) {
        return switch (from) {
            case "open"          -> "investigating".equals(to) || "mitigated".equals(to);
            case "investigating" -> "mitigated".equals(to) || "resolved".equals(to);
            case "mitigated"     -> "resolved".equals(to) || "investigating".equals(to);
            case "resolved"      -> "postmortem".equals(to);
            default              -> false;
        };
    }

    private static String toJson(List<String> xs) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < xs.size(); i++) {
            if (i > 0) sb.append(",");
            sb.append('"').append(xs.get(i).replace("\"", "\\\"")).append('"');
        }
        return sb.append("]").toString();
    }
}
