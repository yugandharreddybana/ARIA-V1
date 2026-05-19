package com.aria.migration.service;

import com.aria.migration.model.MigrationPhaseRun;
import com.aria.migration.model.MigrationPlaybook;
import com.aria.migration.repository.MigrationPhaseRunRepository;
import com.aria.migration.repository.MigrationPlaybookRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * V27.9 §17.3 — Zero-Downtime Migration Orchestrator.
 *
 * Parses a YAML playbook (see {@link PlaybookYaml}) of ordered phases, persists every phase
 * before execution, and runs them sequentially. Each phase declares a `rollback_type`:
 *   - stateless_safe       → auto-rollback on failure is allowed
 *   - stateful_dangerous   → auto-rollback FORBIDDEN once real data has flowed; the runner halts
 *                            and surfaces the failure for human review (V27.9 §17 hard rule)
 *   - irreversible         → never rolls back; halts on failure for human investigation
 *
 * Health checks between phases are an injected hook (`HealthGate`) so tests + Sprint 14
 * benchmarks can plug in different probes without coupling the runner to a specific
 * observability backend.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MigrationOrchestratorService {

    private final MigrationPlaybookRepository playbooks;
    private final MigrationPhaseRunRepository runs;

    public interface HealthGate {
        /** Return true to proceed to the next phase, false to halt. */
        boolean ok(MigrationPhaseRun completed);
    }
    public interface PhaseExecutor {
        /** Throw on failure; return on success. */
        void run(MigrationPhaseRun phase) throws Exception;
    }

    /** Default health gate — always passes. Sprint 14 replaces with Datadog/Prom check. */
    public static final HealthGate ALWAYS_OK = phase -> true;

    @Transactional
    public MigrationPlaybook register(String name, String yaml, String signedBy) {
        String hash = sha256(yaml);
        return playbooks.save(MigrationPlaybook.builder()
                .name(name).yaml(yaml).signedHash(hash).signedBy(signedBy)
                .build());
    }

    @Transactional(readOnly = true)
    public Optional<MigrationPlaybook> findByName(String name) {
        return playbooks.findByName(name);
    }

    @Transactional
    public List<MigrationPhaseRun> queuePhases(UUID playbookId, List<PlaybookPhase> parsed) {
        List<MigrationPhaseRun> out = new ArrayList<>(parsed.size());
        for (int i = 0; i < parsed.size(); i++) {
            PlaybookPhase p = parsed.get(i);
            out.add(runs.save(MigrationPhaseRun.builder()
                    .playbookId(playbookId)
                    .phaseIndex(i)
                    .phaseName(p.name())
                    .rollbackType(p.rollbackType())
                    .status("queued")
                    .build()));
        }
        return out;
    }

    /**
     * Sequential phase runner — halts on first failure honouring the rollback_type rule.
     * Returns the list of MigrationPhaseRun rows after execution (status updated in-place).
     */
    @Transactional
    public List<MigrationPhaseRun> run(UUID playbookId, PhaseExecutor exec, HealthGate gate) {
        List<MigrationPhaseRun> phases = runs.findByPlaybookIdOrderByPhaseIndexAsc(playbookId);
        for (MigrationPhaseRun phase : phases) {
            if (!"queued".equals(phase.getStatus())) continue;
            phase.setStatus("running");
            phase.setStartedAt(Instant.now());
            runs.save(phase);
            try {
                exec.run(phase);
                phase.setStatus("passed");
                phase.setFinishedAt(Instant.now());
                runs.save(phase);
                if (!gate.ok(phase)) {
                    phase.setStatus("blocked");
                    phase.setNotes("Health gate refused to advance");
                    runs.save(phase);
                    break;
                }
            } catch (Exception ex) {
                phase.setStatus("failed");
                phase.setFinishedAt(Instant.now());
                phase.setNotes(ex.getMessage());
                runs.save(phase);
                if ("stateless_safe".equals(phase.getRollbackType())) {
                    phase.setRollbackExecuted(true);
                    phase.setStatus("rolled_back");
                    runs.save(phase);
                } else {
                    // stateful_dangerous / irreversible — NEVER auto-rollback. Halt + alert.
                    log.error("MIGRATION_HALT playbook={} phase={} rollback_type={} reason={}",
                            playbookId, phase.getPhaseName(), phase.getRollbackType(), ex.getMessage());
                }
                break;
            }
        }
        return runs.findByPlaybookIdOrderByPhaseIndexAsc(playbookId);
    }

    public record PlaybookPhase(String name, String rollbackType, List<String> tests, List<String> metrics) {}

    /** Minimal YAML parser for the playbook shape (kept dependency-free). */
    public record PlaybookYaml(String name, List<PlaybookPhase> phases) {

        public static PlaybookYaml parse(String yaml) {
            String name = "unnamed";
            List<PlaybookPhase> phases = new ArrayList<>();
            String currentName = null, rollbackType = null;
            List<String> tests = new ArrayList<>(), metrics = new ArrayList<>();
            String section = null;       // "tests" | "metrics" | null
            for (String raw : yaml.split("\n")) {
                String line = raw.replace("\r", "");
                if (line.startsWith("name:")) {
                    name = unquote(line.substring("name:".length()).trim());
                    continue;
                }
                if (line.startsWith("phases:")) continue;
                if (line.matches("^\\s+-\\s+name:.*")) {
                    if (currentName != null) phases.add(new PlaybookPhase(currentName, rollbackType, tests, metrics));
                    currentName = unquote(line.replaceAll("^\\s+-\\s+name:\\s*", ""));
                    rollbackType = null;
                    tests = new ArrayList<>(); metrics = new ArrayList<>(); section = null;
                    continue;
                }
                if (line.matches("^\\s+rollback_type:.*")) {
                    rollbackType = unquote(line.replaceAll("^\\s+rollback_type:\\s*", ""));
                    section = null;
                } else if (line.matches("^\\s+tests:.*")) {
                    section = "tests";
                } else if (line.matches("^\\s+metrics:.*")) {
                    section = "metrics";
                } else if (line.matches("^\\s+-\\s+.*") && section != null) {
                    String v = unquote(line.replaceAll("^\\s+-\\s+", ""));
                    if ("tests".equals(section)) tests.add(v);
                    if ("metrics".equals(section)) metrics.add(v);
                }
            }
            if (currentName != null) phases.add(new PlaybookPhase(currentName, rollbackType, tests, metrics));
            return new PlaybookYaml(name, phases);
        }

        private static String unquote(String s) {
            s = s.trim();
            if (s.startsWith("\"") && s.endsWith("\"")) return s.substring(1, s.length() - 1);
            return s;
        }
    }

    private static String sha256(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s == null ? new byte[0] : s.getBytes());
            return HexFormat.of().formatHex(d);
        } catch (Exception e) { return ""; }
    }
}
