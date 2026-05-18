package com.aria.incident;

import com.aria.incident.model.SemanticTripwire;
import com.aria.incident.repository.SemanticTripwireRepository;
import com.aria.incident.service.IncidentCommanderService;
import com.aria.incident.service.SemanticTripwireService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class SemanticTripwireServiceTest {

    private SemanticTripwireRepository repo;
    private IncidentCommanderService commander;
    private SemanticTripwireService svc;

    @BeforeEach
    void setup() {
        repo = mock(SemanticTripwireRepository.class);
        commander = mock(IncidentCommanderService.class);
        svc = new SemanticTripwireService(repo, commander);
        when(repo.save(any(SemanticTripwire.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void install_generates_unique_honeypot_with_aria_prefix() {
        String h1 = svc.install("users", "email");
        String h2 = svc.install("users", "email");
        assertThat(h1).startsWith("__aria_tripwire_");
        assertThat(h2).startsWith("__aria_tripwire_");
        assertThat(h1).isNotEqualTo(h2);
    }

    @Test
    void checkAccess_returns_false_for_non_tripwire_values() {
        assertThat(svc.checkAccess(null, "x")).isFalse();
        assertThat(svc.checkAccess("plain-value", "x")).isFalse();
        verifyNoInteractions(commander);
    }

    @Test
    void checkAccess_declares_P1_incident_on_first_hit_only() {
        String h = "__aria_tripwire_abc123__";
        SemanticTripwire t = SemanticTripwire.builder().tableName("users").columnName("email").honeypot(h).build();
        when(repo.findByHoneypot(h)).thenReturn(Optional.of(t));

        assertThat(svc.checkAccess(h, "test ctx")).isTrue();
        verify(commander, times(1)).declare(eq("tripwire"), eq("P1"), any(), any(), eq(null), any());

        // Already-triggered: should not declare again.
        t.setTriggeredAt(java.time.Instant.now());
        when(repo.findByHoneypot(h)).thenReturn(Optional.of(t));
        assertThat(svc.checkAccess(h, "again")).isTrue();
        verify(commander, times(1)).declare(any(), any(), any(), any(), any(), any());
    }
}
