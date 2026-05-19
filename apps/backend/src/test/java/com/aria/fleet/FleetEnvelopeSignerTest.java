package com.aria.fleet;

import com.aria.fleet.model.AgentRegistration;
import com.aria.fleet.repository.AgentRegistrationRepository;
import com.aria.fleet.service.FleetEnvelopeSigner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.security.*;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FleetEnvelopeSignerTest {

    private AgentRegistrationRepository agents;
    private FleetEnvelopeSigner signer;
    private KeyPair kp;

    @BeforeEach
    void setup() throws GeneralSecurityException {
        agents = mock(AgentRegistrationRepository.class);
        signer = new FleetEnvelopeSigner(agents);
        kp = KeyPairGenerator.getInstance("Ed25519").generateKeyPair();

        String pubB64 = Base64.getEncoder().encodeToString(kp.getPublic().getEncoded());
        AgentRegistration reg = AgentRegistration.builder()
                .agentId("agent-a").agentFamily("backend-api-specialist")
                .ed25519PubkeyBase64(pubB64)
                .fingerprint(HexFormat.of().formatHex(
                        MessageDigest.getInstance("SHA-256").digest(kp.getPublic().getEncoded())))
                .build();
        when(agents.findById("agent-a")).thenReturn(Optional.of(reg));
    }

    @Test
    void sign_then_verify_round_trips() {
        String sig = signer.sign(kp.getPrivate(), "epic-1", "CONTRACT_DRAFTED", "{\"foo\":1}", "agent-a");
        assertThat(signer.verify("epic-1", "CONTRACT_DRAFTED", "{\"foo\":1}", "agent-a", sig)).isTrue();
    }

    @Test
    void verify_rejects_when_payload_tampered() {
        String sig = signer.sign(kp.getPrivate(), "epic-1", "CONTRACT_DRAFTED", "{\"foo\":1}", "agent-a");
        assertThat(signer.verify("epic-1", "CONTRACT_DRAFTED", "{\"foo\":2}", "agent-a", sig)).isFalse();
    }

    @Test
    void verify_rejects_unknown_agent() {
        String sig = signer.sign(kp.getPrivate(), "epic-1", "T", "{}", "agent-a");
        assertThat(signer.verify("epic-1", "T", "{}", "agent-ZZZ", sig)).isFalse();
    }

    @Test
    void verify_rejects_when_topic_tampered() {
        String sig = signer.sign(kp.getPrivate(), "epic-1", "CONTRACT_DRAFTED", "{}", "agent-a");
        assertThat(signer.verify("epic-1", "SCHEMA_UPDATED", "{}", "agent-a", sig)).isFalse();
    }
}
