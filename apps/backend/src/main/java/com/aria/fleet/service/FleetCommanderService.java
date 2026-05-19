package com.aria.fleet.service;

import com.aria.fleet.model.FleetOutcome;
import com.aria.fleet.repository.FleetOutcomeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

/**
 * V27.9 §17.4 — Fleet Commander.
 *
 * Aggregates the canonical four-event lifecycle:
 *   CONTRACT_DRAFTED → SCHEMA_UPDATED → CLIENT_IMPLEMENTATION_READY → CONTRACT_TEST_RESULTS
 *
 * Every event is signature-verified BEFORE persisting. Unsigned envelopes are dropped and
 * logged (`FLEET_ENVELOPE_REJECTED`). The healing cascade guardrail consumes the same stream
 * separately to detect A→B→C→A cycles (see {@link HealingGuardrailService}).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FleetCommanderService {

    public static final Set<String> CANONICAL_TOPICS = Set.of(
            "CONTRACT_DRAFTED",
            "SCHEMA_UPDATED",
            "CLIENT_IMPLEMENTATION_READY",
            "CONTRACT_TEST_RESULTS",
            "FLEET_HEALING_CIRCUIT_BREAKER"     // emitted by the guardrail
    );

    private final FleetOutcomeRepository outcomes;
    private final FleetEnvelopeSigner signer;

    @Transactional
    public FleetOutcome publish(String epicId, String topic, String payload, String agentId, String signatureBase64) {
        if (!signer.verify(epicId, topic, payload, agentId, signatureBase64)) {
            log.warn("FLEET_ENVELOPE_REJECTED epic={} topic={} agent={}", epicId, topic, agentId);
            throw new IllegalArgumentException("Invalid envelope signature");
        }
        if (!CANONICAL_TOPICS.contains(topic)) {
            log.info("FLEET_TOPIC_NONCANONICAL topic={} epic={} — accepted (advisory)", topic, epicId);
        }
        return outcomes.save(FleetOutcome.builder()
                .epicId(epicId).topic(topic).payload(payload)
                .agentId(agentId).signature(signatureBase64)
                .build());
    }

    @Transactional(readOnly = true)
    public List<FleetOutcome> recent(String epicId) {
        return epicId == null
                ? outcomes.findTop50ByOrderByCreatedAtDesc()
                : outcomes.findTop100ByEpicIdOrderByCreatedAtDesc(epicId);
    }
}
