package com.aria.incident;

import com.aria.incident.model.Incident;
import com.aria.incident.repository.IncidentRepository;
import com.aria.incident.service.IncidentCommanderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class IncidentCommanderServiceTest {

    private IncidentRepository repo;
    private IncidentCommanderService svc;

    @BeforeEach
    void setup() {
        repo = mock(IncidentRepository.class);
        svc  = new IncidentCommanderService(repo);
        when(repo.save(any(Incident.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void declare_persists_an_open_incident() {
        Incident i = svc.declare("slo-breach", "P1", "latency", "spiked", null, List.of("abc123"));
        assertThat(i.getStatus()).isEqualTo("open");
        assertThat(i.getRelatedCommits()).contains("abc123");
    }

    @Test
    void transition_open_to_investigating_is_valid() {
        UUID id = UUID.randomUUID();
        Incident existing = Incident.builder().id(id).source("x").severity("P2").title("t").description("d").status("open").build();
        when(repo.findById(id)).thenReturn(Optional.of(existing));

        Incident after = svc.transition(id, "investigating");
        assertThat(after.getStatus()).isEqualTo("investigating");
    }

    @Test
    void transition_resolved_to_open_is_invalid() {
        UUID id = UUID.randomUUID();
        Incident existing = Incident.builder().id(id).source("x").severity("P2").title("t").description("d").status("resolved").build();
        when(repo.findById(id)).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> svc.transition(id, "open")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void transition_resolved_sets_resolved_at() {
        UUID id = UUID.randomUUID();
        Incident existing = Incident.builder().id(id).source("x").severity("P2").title("t").description("d").status("mitigated").build();
        when(repo.findById(id)).thenReturn(Optional.of(existing));
        Incident after = svc.transition(id, "resolved");
        assertThat(after.getResolvedAt()).isNotNull();
    }
}
