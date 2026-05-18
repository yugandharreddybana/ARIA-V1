package com.aria.migration;

import com.aria.migration.model.MigrationPhaseRun;
import com.aria.migration.model.MigrationPlaybook;
import com.aria.migration.repository.MigrationPhaseRunRepository;
import com.aria.migration.repository.MigrationPlaybookRepository;
import com.aria.migration.service.MigrationOrchestratorService;
import com.aria.migration.service.MigrationOrchestratorService.PlaybookYaml;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

class MigrationOrchestratorServiceTest {

    private MigrationPlaybookRepository playbookRepo;
    private MigrationPhaseRunRepository runRepo;
    private MigrationOrchestratorService svc;

    @BeforeEach
    void setup() {
        playbookRepo = mock(MigrationPlaybookRepository.class);
        runRepo      = mock(MigrationPhaseRunRepository.class);
        svc          = new MigrationOrchestratorService(playbookRepo, runRepo);
        when(playbookRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(runRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void parses_a_minimal_playbook_yaml() {
        String yaml = """
                name: rotate-secrets
                phases:
                  - name: backfill_new_column
                    rollback_type: stateless_safe
                    tests:
                      - "schema validates"
                  - name: switch_writes
                    rollback_type: stateful_dangerous
                    metrics:
                      - "error_rate"
                """;
        PlaybookYaml p = PlaybookYaml.parse(yaml);
        assertThat(p.name()).isEqualTo("rotate-secrets");
        assertThat(p.phases()).hasSize(2);
        assertThat(p.phases().get(0).rollbackType()).isEqualTo("stateless_safe");
        assertThat(p.phases().get(1).rollbackType()).isEqualTo("stateful_dangerous");
        assertThat(p.phases().get(0).tests()).contains("schema validates");
    }

    @Test
    void register_persists_playbook_with_sha256_hash() {
        MigrationPlaybook saved = svc.register("rotate", "name: rotate\nphases: []\n", "human:tech-lead");
        assertThat(saved.getSignedHash()).hasSize(64);
        assertThat(saved.getName()).isEqualTo("rotate");
    }

    @Test
    void run_halts_on_stateful_dangerous_failure_without_rollback() {
        UUID pid = UUID.randomUUID();
        List<MigrationPhaseRun> phases = new ArrayList<>(List.of(
            MigrationPhaseRun.builder().id(UUID.randomUUID()).playbookId(pid)
                .phaseIndex(0).phaseName("p1").rollbackType("stateful_dangerous").status("queued").build()
        ));
        when(runRepo.findByPlaybookIdOrderByPhaseIndexAsc(pid)).thenReturn(phases);

        List<MigrationPhaseRun> out = svc.run(pid, ph -> { throw new RuntimeException("boom"); }, MigrationOrchestratorService.ALWAYS_OK);
        assertThat(out.get(0).getStatus()).isEqualTo("failed");
        assertThat(out.get(0).isRollbackExecuted()).isFalse();
    }

    @Test
    void run_rolls_back_stateless_safe_phase_on_failure() {
        UUID pid = UUID.randomUUID();
        List<MigrationPhaseRun> phases = new ArrayList<>(List.of(
            MigrationPhaseRun.builder().id(UUID.randomUUID()).playbookId(pid)
                .phaseIndex(0).phaseName("p1").rollbackType("stateless_safe").status("queued").build()
        ));
        when(runRepo.findByPlaybookIdOrderByPhaseIndexAsc(pid)).thenReturn(phases);

        List<MigrationPhaseRun> out = svc.run(pid, ph -> { throw new RuntimeException("boom"); }, MigrationOrchestratorService.ALWAYS_OK);
        assertThat(out.get(0).getStatus()).isEqualTo("rolled_back");
        assertThat(out.get(0).isRollbackExecuted()).isTrue();
    }

    @Test
    void run_advances_through_passing_phases_and_respects_health_gate() {
        UUID pid = UUID.randomUUID();
        List<MigrationPhaseRun> phases = new ArrayList<>(List.of(
            MigrationPhaseRun.builder().id(UUID.randomUUID()).playbookId(pid).phaseIndex(0).phaseName("a").rollbackType("stateless_safe").status("queued").build(),
            MigrationPhaseRun.builder().id(UUID.randomUUID()).playbookId(pid).phaseIndex(1).phaseName("b").rollbackType("stateless_safe").status("queued").build()
        ));
        when(runRepo.findByPlaybookIdOrderByPhaseIndexAsc(pid)).thenReturn(phases);

        List<MigrationPhaseRun> out = svc.run(pid, ph -> {}, ph -> ph.getPhaseName().equals("a"));   // gate blocks after phase a
        assertThat(out.get(0).getStatus()).isEqualTo("passed");
        assertThat(out.get(1).getStatus()).isEqualTo("blocked");
    }
}
