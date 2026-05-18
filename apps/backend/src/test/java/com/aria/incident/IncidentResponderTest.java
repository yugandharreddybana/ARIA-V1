package com.aria.incident;

import com.aria.incident.model.Incident;
import com.aria.incident.service.IncidentResponder;
import com.aria.incident.service.JiraMcpStub;
import com.aria.incident.service.SemanticCorrelator;
import com.aria.orchestrator.dto.CreateSessionRequest;
import com.aria.orchestrator.dto.SessionDto;
import com.aria.orchestrator.service.OrchestratorService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class IncidentResponderTest {

    private OrchestratorService orchestrator;
    private SemanticCorrelator correlator;
    private JiraMcpStub jira;
    private IncidentResponder responder;
    private final UUID projectId = UUID.randomUUID();
    private final UUID userId    = UUID.randomUUID();

    @BeforeEach
    void setup() {
        orchestrator = mock(OrchestratorService.class);
        correlator   = mock(SemanticCorrelator.class);
        jira         = mock(JiraMcpStub.class);
        responder    = new IncidentResponder(orchestrator, correlator, jira);
        when(jira.createIncidentTicket(any(), any(), any())).thenReturn("ARIA-stub01");
    }

    @Test
    void escalate_P0_with_project_spawns_precision_session() {
        UUID newSessionId = UUID.randomUUID();
        when(orchestrator.create(any(CreateSessionRequest.class), any())).thenReturn(
                new SessionDto(newSessionId, projectId, null, userId,
                        "new", "precision", "dev", "stability", null, null, Instant.now(), null));
        when(correlator.correlate(eq(projectId), any(), anyInt())).thenReturn(List.of("apps/backend/src/X.java"));

        Incident inc = Incident.builder().id(UUID.randomUUID()).source("slo-breach").severity("P0")
                .title("auth 5xx").description("spiked above 2%").status("open").build();

        var result = responder.escalate(inc, projectId, userId);

        assertThat(result.precisionSessionId()).isEqualTo(newSessionId);
        assertThat(result.likelyFiles()).contains("apps/backend/src/X.java");
        assertThat(result.jiraKey()).isEqualTo("ARIA-stub01");
    }

    @Test
    void escalate_P3_does_not_spawn_session() {
        Incident inc = Incident.builder().id(UUID.randomUUID()).source("operator").severity("P3")
                .title("minor").description("noise").status("open").build();

        var result = responder.escalate(inc, projectId, userId);

        assertThat(result.precisionSessionId()).isNull();
        verifyNoInteractions(orchestrator);
    }

    @Test
    void escalate_without_project_skips_session_and_correlator() {
        Incident inc = Incident.builder().id(UUID.randomUUID()).source("op").severity("P1")
                .title("t").description("d").status("open").build();

        when(correlator.correlate(eq(null), any(), anyInt())).thenReturn(List.of());

        var result = responder.escalate(inc, null, userId);

        assertThat(result.precisionSessionId()).isNull();
        assertThat(result.likelyFiles()).isEmpty();
        verifyNoInteractions(orchestrator);
        verify(jira).createIncidentTicket(eq("P1"), any(), any());
    }
}
