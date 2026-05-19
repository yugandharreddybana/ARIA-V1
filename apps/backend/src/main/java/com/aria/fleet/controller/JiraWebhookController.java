package com.aria.fleet.controller;

import com.aria.fleet.service.ShadowBranchService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Map;

/**
 * V27.9 §17.4 — Jira webhook listener for Pre-Cog Speculative Execution.
 *
 * Jira posts to `/api/fleet/jira-webhook` when a ticket is created/updated/transitioned. We
 * spawn a `aria-shadow/<ticket>` row so a Sprint 14 git driver can fan out speculative work
 * onto a shadow branch.
 *
 * Auth is **shared-secret HMAC-SHA256** over the raw request body, sent in the
 * `X-Jira-Signature` header. Configure the secret via `ARIA_JIRA_WEBHOOK_SECRET`. When empty
 * the endpoint refuses every request — local dev sets the env var or the listener stays off.
 */
@Slf4j
@RestController
@RequestMapping("/api/fleet")
@RequiredArgsConstructor
public class JiraWebhookController {

    private final ShadowBranchService shadow;

    @Value("${aria.jira.webhook.secret:}")
    private String webhookSecret;

    public record JiraWebhookPayload(
            @NotBlank String webhookEvent,
            JiraIssue issue
    ) {}
    public record JiraIssue(@NotBlank String key, JiraFields fields) {}
    public record JiraFields(String summary, String description) {}

    @PostMapping("/jira-webhook")
    public ResponseEntity<?> receive(@RequestBody String rawBody,
                                     @RequestHeader(value = "X-Jira-Signature", required = false) String sig,
                                     HttpServletRequest req) {
        if (webhookSecret == null || webhookSecret.isEmpty()) {
            log.warn("JIRA_WEBHOOK_REJECTED reason=secret_not_configured ip={}", req.getRemoteAddr());
            return ResponseEntity.status(503).body(Map.of("code", "WEBHOOK_NOT_CONFIGURED"));
        }
        if (sig == null || !constantTimeEquals(sig, computeHmac(rawBody, webhookSecret))) {
            log.warn("JIRA_WEBHOOK_REJECTED reason=bad_signature ip={}", req.getRemoteAddr());
            return ResponseEntity.status(401).body(Map.of("code", "BAD_SIGNATURE"));
        }

        // Best-effort parse — we only need the issue key. If parsing fails the webhook is
        // acknowledged but no shadow branch is created (Jira retries are not desired).
        String key = extractKey(rawBody);
        if (key == null) {
            log.info("JIRA_WEBHOOK_NO_KEY raw_length={}", rawBody.length());
            return ResponseEntity.ok(Map.of("status", "no_issue_key"));
        }
        String branch = shadow.open(key, null);
        log.info("JIRA_WEBHOOK_SHADOW_OPENED key={} branch={}", key, branch);
        return ResponseEntity.ok(Map.of("status", "opened", "branch", branch, "ticket", key));
    }

    /** Tiny JSON extractor for `issue.key` — avoids pulling in Jackson at this scope. */
    static String extractKey(String body) {
        int i = body.indexOf("\"key\"");
        if (i < 0) return null;
        int colon = body.indexOf(':', i);
        if (colon < 0) return null;
        int q1 = body.indexOf('"', colon + 1);
        int q2 = q1 < 0 ? -1 : body.indexOf('"', q1 + 1);
        if (q1 < 0 || q2 < 0) return null;
        String candidate = body.substring(q1 + 1, q2);
        return candidate.matches("[A-Z][A-Z0-9_]+-\\d+") ? candidate : null;
    }

    static String computeHmac(String body, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return "sha256=" + HexFormat.of().formatHex(mac.doFinal(body.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) { return "sha256=" + "0".repeat(64); }
    }

    static boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null || a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) diff |= a.charAt(i) ^ b.charAt(i);
        return diff == 0;
    }
}
