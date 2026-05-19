package com.aria.fleet;

import com.aria.fleet.model.AgentRegistration;
import com.aria.fleet.repository.AgentRegistrationRepository;
import com.aria.fleet.service.AgentRegistryService;
import com.aria.fleet.service.FleetEnvelopeSigner;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.security.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class AgentRegistryServiceTest {

    private AgentRegistrationRepository repo;
    private AgentRegistryService svc;

    @BeforeEach
    void setup() {
        repo = mock(AgentRegistrationRepository.class);
        svc = new AgentRegistryService(repo);
        when(repo.save(any(AgentRegistration.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @Test
    void register_generates_keypair_and_returns_private_key() {
        when(repo.existsById("agent-x")).thenReturn(false);
        var result = svc.register("agent-x", "backend-api-specialist");
        assertThat(result.agentId()).isEqualTo("agent-x");
        assertThat(result.fingerprint()).hasSize(64);
        assertThat(result.privateKeyPkcs8Base64()).isNotBlank();
    }

    @Test
    void register_rejects_duplicate_agent_id() {
        when(repo.existsById("agent-x")).thenReturn(true);
        assertThatThrownBy(() -> svc.register("agent-x", "x"))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void registered_pubkey_can_sign_and_verify_envelope_round_trip() throws Exception {
        when(repo.existsById("agent-y")).thenReturn(false);
        // capture the saved registration so the verifier can find the pubkey
        var saved = new AgentRegistration[1];
        when(repo.save(any(AgentRegistration.class))).thenAnswer(inv -> {
            saved[0] = inv.getArgument(0); return saved[0];
        });
        var result = svc.register("agent-y", "qa-e2e");

        // Rebuild private key from the PKCS8 base64 we just received.
        byte[] pkcs8 = Base64.getDecoder().decode(result.privateKeyPkcs8Base64());
        PrivateKey priv = KeyFactory.getInstance("Ed25519").generatePrivate(new PKCS8EncodedKeySpec(pkcs8));

        AgentRegistrationRepository repo2 = mock(AgentRegistrationRepository.class);
        when(repo2.findById(eq("agent-y"))).thenReturn(Optional.of(saved[0]));
        FleetEnvelopeSigner signer = new FleetEnvelopeSigner(repo2);

        String sig = signer.sign(priv, "epic", "T", "{}", "agent-y");
        assertThat(signer.verify("epic", "T", "{}", "agent-y", sig)).isTrue();
    }
}
