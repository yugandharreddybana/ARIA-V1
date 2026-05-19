package com.aria.incident.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.security.MessageDigest;
import java.util.HexFormat;

/**
 * V27.9 §17 — Jira MCP stub.
 *
 * Sprint 9 logs the would-be ticket creation. Sprint 17 wires the real Atlassian MCP client
 * + auth; the public method shapes here stay stable so the swap is a one-line dependency change.
 */
@Slf4j
@Service
public class JiraMcpStub {

    /** Returns a stub ticket key (e.g. `ARIA-12ab34cd`) — deterministic per input. */
    public String createIncidentTicket(String severity, String title, String description) {
        String key = "ARIA-" + sha256Prefix(severity + "|" + title + "|" + description, 8);
        String t = title.length() > 80 ? title.substring(0, 80) + "…" : title;
        String d = description.length() > 200 ? description.substring(0, 200) + "…" : description;
        log.info("JIRA_STUB severity={} title={} description={} → key={}", severity, t, d, key);
        return key;
    }

    /** Stub ticket for an SLO breach. */
    public String createSloBreachTicket(String service, String metric, double observed, double threshold) {
        String title = String.format("%s.%s breach: observed=%s threshold=%s", service, metric, observed, threshold);
        return createIncidentTicket("P2", title, title);
    }

    private static String sha256Prefix(String s, int chars) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes());
            return HexFormat.of().formatHex(d).substring(0, chars);
        } catch (Exception e) { return "00000000"; }
    }
}
