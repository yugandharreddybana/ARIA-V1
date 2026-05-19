package com.aria.fleet.service;

import com.aria.fleet.model.AgentRegistration;
import com.aria.fleet.repository.AgentRegistrationRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.*;
import java.util.Base64;
import java.util.HexFormat;

/**
 * V27.9 §3 + §18B — Agent Registry.
 *
 * `register()` generates an Ed25519 keypair for the agent, stores the public key (SPKI base64)
 * plus its SHA-256 fingerprint (the audit handle used in logs and ReplayFrames), and returns
 * the PKCS8-encoded **private key once**. The caller must stash it — Sprint 12 hardens this
 * with OS-keychain storage.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AgentRegistryService {

    private final AgentRegistrationRepository agents;

    public record RegistrationResult(String agentId, String fingerprint, String privateKeyPkcs8Base64) {}

    @Transactional
    public RegistrationResult register(String agentId, String agentFamily) {
        if (agents.existsById(agentId)) {
            throw new IllegalStateException("Agent already registered: " + agentId);
        }
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("Ed25519");
            KeyPair kp = gen.generateKeyPair();
            byte[] pubDer  = kp.getPublic().getEncoded();   // SPKI
            byte[] privDer = kp.getPrivate().getEncoded();  // PKCS8
            String pubBase64  = Base64.getEncoder().encodeToString(pubDer);
            String privBase64 = Base64.getEncoder().encodeToString(privDer);
            byte[] fpBytes = MessageDigest.getInstance("SHA-256").digest(pubDer);
            String fingerprint = HexFormat.of().formatHex(fpBytes);

            agents.save(AgentRegistration.builder()
                    .agentId(agentId)
                    .agentFamily(agentFamily)
                    .ed25519PubkeyBase64(pubBase64)
                    .fingerprint(fingerprint)
                    .build());

            log.info("AGENT_REGISTERED agentId={} family={} fingerprint={}", agentId, agentFamily, fingerprint);
            return new RegistrationResult(agentId, fingerprint, privBase64);
        } catch (GeneralSecurityException e) {
            throw new RuntimeException("Ed25519 keygen failed: " + e.getMessage(), e);
        }
    }
}
