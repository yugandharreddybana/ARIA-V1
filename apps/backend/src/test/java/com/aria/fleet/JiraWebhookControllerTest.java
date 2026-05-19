package com.aria.fleet;

import com.aria.fleet.controller.JiraWebhookController;
import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;

class JiraWebhookControllerTest {

    @Test
    void extractKey_finds_valid_jira_key() {
        String body = "{\"webhookEvent\":\"jira:issue_created\",\"issue\":{\"key\":\"ARIA-42\",\"fields\":{}}}";
        assertThat(JiraWebhookController.extractKey(body)).isEqualTo("ARIA-42");
    }

    @Test
    void extractKey_rejects_non_jira_keys() {
        String body = "{\"key\":\"definitely-not-jira\"}";
        assertThat(JiraWebhookController.extractKey(body)).isNull();
    }

    @Test
    void computeHmac_matches_independent_mac() throws Exception {
        String secret = "shh";
        String body = "{\"x\":1}";
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String expected = "sha256=" + HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        assertThat(JiraWebhookController.computeHmac(body, secret)).isEqualTo(expected);
    }

    @Test
    void constantTimeEquals_handles_length_mismatch() {
        assertThat(JiraWebhookController.constantTimeEquals("abc", "abcd")).isFalse();
        assertThat(JiraWebhookController.constantTimeEquals("abc", "abc")).isTrue();
        assertThat(JiraWebhookController.constantTimeEquals(null, "x")).isFalse();
    }
}
