package com.aria.orchestrator;

import com.aria.exception.AriaException;
import com.aria.orchestrator.dto.CreateSessionRequest;
import com.aria.orchestrator.dto.SessionDto;
import com.aria.orchestrator.model.Session;
import com.aria.orchestrator.model.SessionState;
import com.aria.orchestrator.repository.SessionRepository;
import com.aria.orchestrator.service.OrchestratorService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class OrchestratorServiceTest {

    private SessionRepository repo;
    private OrchestratorService service;
    private final UUID userId    = UUID.randomUUID();
    private final UUID projectId = UUID.randomUUID();
    private final UUID sessionId = UUID.randomUUID();

    @BeforeEach
    void setup() {
        repo = mock(SessionRepository.class);
        service = new OrchestratorService(repo);
        when(repo.save(any(Session.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void create_persists_with_defaults() {
        SessionDto dto = service.create(new CreateSessionRequest(projectId, null, null, null, null, null), userId);
        assertThat(dto.mode()).isEqualTo("precision");
        assertThat(dto.environment()).isEqualTo("dev");
        assertThat(dto.missionType()).isEqualTo("feature");
        assertThat(dto.state()).isEqualTo("new");
    }

    @Test
    void start_transitions_from_new_to_working() {
        Session s = Session.builder()
                .id(sessionId).projectId(projectId).userId(userId)
                .state(SessionState.new_.wire()).mode("precision").environment("dev").missionType("feature")
                .missionRiskAppetite("moderate").missionScope("[]")
                .build();
        when(repo.findById(sessionId)).thenReturn(Optional.of(s));

        SessionDto out = service.start(sessionId, userId);
        assertThat(out.state()).isEqualTo("working");
    }

    @Test
    void pause_only_from_working() {
        Session s = Session.builder()
                .id(sessionId).projectId(projectId).userId(userId)
                .state(SessionState.new_.wire()).mode("precision").environment("dev").missionType("feature")
                .missionRiskAppetite("moderate").missionScope("[]")
                .build();
        when(repo.findById(sessionId)).thenReturn(Optional.of(s));
        assertThatThrownBy(() -> service.pause(sessionId, userId)).isInstanceOf(AriaException.class);
    }

    @Test
    void idor_blocks_other_user() {
        Session s = Session.builder()
                .id(sessionId).projectId(projectId).userId(UUID.randomUUID())
                .state(SessionState.new_.wire()).mode("precision").environment("dev").missionType("feature")
                .missionRiskAppetite("moderate").missionScope("[]")
                .build();
        when(repo.findById(sessionId)).thenReturn(Optional.of(s));
        assertThatThrownBy(() -> service.status(sessionId, userId))
                .isInstanceOf(AriaException.class);
    }

    @Test
    void stop_sets_completed_and_ended_at() {
        Session s = Session.builder()
                .id(sessionId).projectId(projectId).userId(userId)
                .state(SessionState.working.wire()).mode("precision").environment("dev").missionType("feature")
                .missionRiskAppetite("moderate").missionScope("[]")
                .build();
        when(repo.findById(sessionId)).thenReturn(Optional.of(s));
        SessionDto out = service.stop(sessionId, userId);
        assertThat(out.state()).isEqualTo("completed");
        assertThat(out.endedAt()).isNotNull();
    }
}
