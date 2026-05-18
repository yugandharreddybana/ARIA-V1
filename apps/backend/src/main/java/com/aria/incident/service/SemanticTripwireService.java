package com.aria.incident.service;

import com.aria.incident.model.SemanticTripwire;
import com.aria.incident.repository.SemanticTripwireRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;

/**
 * V27.9 §17 + ADR-0013 — Semantic Tripwire generator.
 *
 * `install()` inserts a honeypot record into the registry; Sprint 14 hydrator stamps the
 * `honeypot` value into a sandbox row of `(table, column)`. `checkAccess()` is called by data-
 * access paths in Synthetic Hydrator profiles — any hit triggers `triggered_at` + an incident.
 *
 * Production code MUST NEVER reference any value returned by `install()`; the Anti-Slop Gate
 * (Sprint 6 → extended in Sprint 14) greps every PR for these magic strings.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SemanticTripwireService {

    private static final SecureRandom RNG = new SecureRandom();

    private final SemanticTripwireRepository repo;
    private final IncidentCommanderService commander;

    /** Generate + persist a new honeypot for a (table, column). Returns the magic string. */
    @Transactional
    public String install(String table, String column) {
        byte[] entropy = new byte[16];
        RNG.nextBytes(entropy);
        String honeypot = "__aria_tripwire_" + HexFormat.of().formatHex(entropy) + "__";
        repo.save(SemanticTripwire.builder()
                .tableName(table)
                .columnName(column)
                .honeypot(honeypot)
                .build());
        log.info("TRIPWIRE_INSTALLED table={} column={} honeypot={}", table, column, honeypot);
        return honeypot;
    }

    /**
     * Called by Synthetic Hydrator data-access wrappers whenever a row is read. If the read
     * value matches a tripwire, declare a P1 incident and mark the tripwire triggered.
     */
    @Transactional
    public boolean checkAccess(String observedValue, String context) {
        if (observedValue == null || !observedValue.startsWith("__aria_tripwire_")) return false;
        Optional<SemanticTripwire> maybe = repo.findByHoneypot(observedValue);
        if (maybe.isEmpty()) return false;
        SemanticTripwire t = maybe.get();
        if (t.getTriggeredAt() == null) {
            t.setTriggeredAt(Instant.now());
            t.setTriggerMeta("{\"context\":\"" + context.replace("\"", "\\\"") + "\"}");
            repo.save(t);
            commander.declare(
                "tripwire",
                "P1",
                "Semantic tripwire triggered (" + t.getTableName() + "." + t.getColumnName() + ")",
                "Honeypot " + observedValue + " accessed with context: " + context,
                null,
                java.util.List.of()
            );
        }
        return true;
    }
}
