package com.aria.fleet.service;

import com.aria.fleet.model.AgentRegistration;
import com.aria.fleet.repository.AgentRegistrationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.security.*;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;
import java.util.Optional;

/**
 * V27.9 §17.4 + ADR-0014 — Ed25519 envelope signer / verifier.
 *
 * Canonical signing input (deterministic, version-locked):
 *     {epicId}|{topic}|{payloadCanonical}|{agentId}
 *
 * `payloadCanonical` is the payload string as supplied by the caller — caller is responsible
 * for canonical JSON if the producer + consumer agree on it. Sprint 14 will add a
 * deterministic JSON canonicaliser to remove that responsibility.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FleetEnvelopeSigner {

    private final AgentRegistrationRepository agents;

    /** Sign with a known private key — used by tests and by agents holding their key in memory. */
    public String sign(PrivateKey key, String epicId, String topic, String payload, String agentId) {
        try {
            Signature s = Signature.getInstance("Ed25519");
            s.initSign(key);
            s.update(canonical(epicId, topic, payload, agentId));
            return Base64.getEncoder().encodeToString(s.sign());
        } catch (GeneralSecurityException e) {
            throw new RuntimeException("Ed25519 sign failed: " + e.getMessage(), e);
        }
    }

    /** Verify an envelope against the registered agent's pubkey. */
    public boolean verify(String epicId, String topic, String payload, String agentId, String signatureBase64) {
        Optional<AgentRegistration> agent = agents.findById(agentId);
        if (agent.isEmpty()) {
            log.warn("FLEET_ENVELOPE_UNKNOWN_AGENT agentId={}", agentId);
            return false;
        }
        try {
            byte[] derPub = Base64.getDecoder().decode(agent.get().getEd25519PubkeyBase64());
            PublicKey pub = KeyFactory.getInstance("Ed25519").generatePublic(new X509EncodedKeySpec(derPub));
            Signature s = Signature.getInstance("Ed25519");
            s.initVerify(pub);
            s.update(canonical(epicId, topic, payload, agentId));
            return s.verify(Base64.getDecoder().decode(signatureBase64));
        } catch (GeneralSecurityException | IllegalArgumentException e) {
            log.warn("FLEET_ENVELOPE_VERIFY_FAILED agentId={} err={}", agentId, e.getMessage());
            return false;
        }
    }

    static byte[] canonical(String epicId, String topic, String payload, String agentId) {
        return ((epicId == null ? "" : epicId) + "|" +
                (topic  == null ? "" : topic)  + "|" +
                (payload == null ? "" : payload) + "|" +
                (agentId == null ? "" : agentId)).getBytes();
    }
}
