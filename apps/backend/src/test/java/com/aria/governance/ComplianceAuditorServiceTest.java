package com.aria.governance;

import com.aria.governance.model.ComplianceFinding;
import com.aria.governance.repository.ComplianceFindingRepository;
import com.aria.governance.service.AuditChainService;
import com.aria.governance.service.ComplianceAuditorService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class ComplianceAuditorServiceTest {

    private ComplianceFindingRepository repo;
    private AuditChainService chain;
    private ComplianceAuditorService svc;

    @BeforeEach
    void setup() {
        repo = mock(ComplianceFindingRepository.class);
        chain = mock(AuditChainService.class);
        when(repo.save(any())).thenAnswer(inv -> {
            ComplianceFinding f = inv.getArgument(0);
            if (f.getId() == null) f.setId(UUID.randomUUID());
            return f;
        });
        svc = new ComplianceAuditorService(repo, chain);
    }

    @Test
    void scanDiff_flags_pii_column_reference() {
        List<ComplianceFinding> found = svc.scanDiff("ci", "pr-1", "src/x.ts", "ALTER TABLE users ADD email TEXT;");
        assertThat(found).anySatisfy(f -> assertThat(f.getCategory()).isEqualTo("pii"));
    }

    @Test
    void scanDiff_flags_console_log_with_secret() {
        List<ComplianceFinding> found = svc.scanDiff("ci", "pr-2", "x.ts", "console.log('token', token);");
        assertThat(found).anySatisfy(f -> assertThat(f.getCategory()).isEqualTo("logging"));
        assertThat(found).anySatisfy(f -> assertThat(f.getSeverity()).isEqualTo("blocking"));
    }

    @Test
    void scanDiff_flags_weak_bcrypt_cost() {
        List<ComplianceFinding> found = svc.scanDiff("ci", "pr-3", "auth.ts", "bcrypt.hash(pw, 5);");
        assertThat(found).anySatisfy(f -> assertThat(f.getCategory()).isEqualTo("encryption"));
    }

    @Test
    void scanDiff_returns_empty_on_clean_diff() {
        assertThat(svc.scanDiff("ci", "pr-4", "x.ts", "export const PI = 3.14;")).isEmpty();
        verifyNoInteractions(chain);
    }

    @Test
    void decide_only_accepts_known_states() {
        UUID id = UUID.randomUUID();
        when(repo.findById(id)).thenReturn(Optional.of(
            ComplianceFinding.builder().id(id).status("open").category("pii").severity("warning")
                .triggeredBy("ci").description("d").build()));
        assertThat(svc.decide(id, "alice", "accepted").getStatus()).isEqualTo("accepted");
        assertThatThrownBy(() -> svc.decide(id, "alice", "invalid"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
