package com.aria.incident.service;

import com.aria.incident.model.Incident;
import com.aria.orchestrator.dto.CreateSessionRequest;
import com.aria.orchestrator.dto.SessionDto;
import com.aria.orchestrator.service.OrchestratorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * V27.9 §17 — Incident Responder orchestration.
 *
 * For every declared incident:
 *   1. If severity is P0 or P1 AND a `relatedProjectId` is supplied, spawn a Precision-mode session
 *      via {@link OrchestratorService}. Sprint 14 wires that session to the auto-hotfix workflow.
 *   2. Correlate against the Concept Graph (`SemanticCorrelator`) to surface the top-N likely files.
 *   3. Open a Jira stub ticket (`JiraMcpStub`). Sprint 17 wires the real MCP.
 *
 * Decoupled from {@link IncidentCommanderService} so the basic declare path stays cheap when
 * the responder is disabled (tests, dry runs).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class IncidentResponder {

    private final OrchestratorService orchestrator;
    private final SemanticCorrelator correlator;
    private final JiraMcpStub jira;

    public record EscalationResult(
            UUID incidentId,
            UUID precisionSessionId,
            List<String> likelyFiles,
            String jiraKey
    ) {}

    /**
     * @param incident the declared incident
     * @param relatedProjectId optional project to scope graph correlation + session creation
     * @param actorUserId user id to own the Precision session — typically the SRE on call
     */
    @Transactional
    public EscalationResult escalate(Incident incident, UUID relatedProjectId, UUID actorUserId) {
        UUID sessionId = null;
        if (relatedProjectId != null && actorUserId != null && isHighSeverity(incident.getSeverity())) {
            try {
                SessionDto session = orchestrator.create(
                        new CreateSessionRequest(relatedProjectId, "precision", "dev", "stability", null, null),
                        actorUserId);
                sessionId = session.id();
                log.info("PRECISION_SESSION_OPENED incident={} session={} severity={}",
                        incident.getId(), sessionId, incident.getSeverity());
            } catch (Exception ex) {
                log.warn("Failed to spawn Precision session for incident {}: {}", incident.getId(), ex.getMessage());
            }
        }

        List<String> files = correlator.correlate(relatedProjectId,
                incident.getTitle() + " " + incident.getDescription(), 5);

        String jiraKey = jira.createIncidentTicket(
                incident.getSeverity(), incident.getTitle(), incident.getDescription());

        return new EscalationResult(incident.getId(), sessionId, files, jiraKey);
    }

    private static boolean isHighSeverity(String s) { return "P0".equals(s) || "P1".equals(s); }
}
