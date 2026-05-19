package com.aria.governance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * V27.9 §12 + ADR-0019 — append-only governance audit chain.
 *
 * Each row's `chain_hash = sha256(prev_chain_hash || canonical(payload))`. Tamper detection is
 * a single SQL pass per export; signed bundles ship via {@link AuditExportService}.
 *
 * Canonicalisation: payload keys sorted ascending, joined by `|`. Same shape used for
 * `audit_chain` and {@link com.aria.governance.service.GdprRedactionService#redact}.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditChainService {

    private final JdbcTemplate jdbc;

    @Transactional
    public String appendEvent(String eventType, String actor, Map<String, ?> payload) {
        String canonical = canonical(payload);
        String prevHash  = jdbc.query(
            "SELECT chain_hash FROM audit_chain ORDER BY seq DESC LIMIT 1",
            rs -> rs.next() ? rs.getString(1) : null);
        String chainHash = sha256((prevHash == null ? "" : prevHash) + "|" + canonical);
        jdbc.update(
            "INSERT INTO audit_chain (event_type, actor, payload, prev_hash, chain_hash) " +
            "VALUES (?, ?, ?::jsonb, ?, ?)",
            eventType, actor, toJson(payload), prevHash, chainHash);
        return chainHash;
    }

    @Transactional(readOnly = true)
    public boolean verifyChainBetween(long fromSeq, long toSeq) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT seq, payload::text AS payload, prev_hash, chain_hash " +
            "FROM audit_chain WHERE seq BETWEEN ? AND ? ORDER BY seq ASC",
            fromSeq, toSeq);
        String runningPrev = null;
        for (Map<String, Object> r : rows) {
            String payload = (String) r.get("payload");
            String prev    = (String) r.get("prev_hash");
            String chain   = (String) r.get("chain_hash");
            if (prev != null && !prev.equals(runningPrev) && runningPrev != null) return false;
            String expected = sha256((prev == null ? "" : prev) + "|" + canonical(parseJson(payload)));
            if (!expected.equals(chain)) return false;
            runningPrev = chain;
        }
        return true;
    }

    @Transactional(readOnly = true)
    public long currentSeq() {
        Long s = jdbc.queryForObject("SELECT COALESCE(MAX(seq), 0) FROM audit_chain", Long.class);
        return s == null ? 0L : s;
    }

    static String canonical(Map<String, ?> payload) {
        if (payload == null) return "";
        TreeMap<String, ?> sorted = new TreeMap<>(payload);
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, ?> e : sorted.entrySet()) {
            if (sb.length() > 0) sb.append('|');
            sb.append(e.getKey()).append('=').append(String.valueOf(e.getValue()));
        }
        return sb.toString();
    }

    static String toJson(Map<String, ?> payload) {
        if (payload == null) return "{}";
        StringBuilder sb = new StringBuilder("{");
        int i = 0;
        for (Map.Entry<String, ?> e : new TreeMap<>(payload).entrySet()) {
            if (i++ > 0) sb.append(',');
            sb.append('"').append(escape(e.getKey())).append('"').append(':');
            Object v = e.getValue();
            if (v == null) sb.append("null");
            else if (v instanceof Number || v instanceof Boolean) sb.append(v);
            else sb.append('"').append(escape(String.valueOf(v))).append('"');
        }
        return sb.append('}').toString();
    }

    static Map<String, Object> parseJson(String json) {
        // Minimal parser — only flat string/number/boolean maps. Sprint 14 swaps to Jackson.
        Map<String, Object> out = new TreeMap<>();
        if (json == null || json.length() < 2) return out;
        String body = json.trim();
        if (body.startsWith("{")) body = body.substring(1);
        if (body.endsWith("}"))   body = body.substring(0, body.length() - 1);
        for (String pair : splitTopLevel(body, ',')) {
            int colon = indexOfTopLevel(pair, ':');
            if (colon < 0) continue;
            String k = pair.substring(0, colon).trim().replaceAll("^\"|\"$", "");
            String v = pair.substring(colon + 1).trim();
            if (v.startsWith("\"") && v.endsWith("\"")) out.put(k, v.substring(1, v.length() - 1));
            else if ("true".equals(v) || "false".equals(v)) out.put(k, Boolean.valueOf(v));
            else { try { out.put(k, Long.valueOf(v)); } catch (NumberFormatException ex) { out.put(k, v); } }
        }
        return out;
    }
    static List<String> splitTopLevel(String s, char delim) {
        List<String> out = new java.util.ArrayList<>();
        int depth = 0, start = 0; boolean inStr = false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' && (i == 0 || s.charAt(i-1) != '\\')) inStr = !inStr;
            else if (!inStr && (c == '{' || c == '[')) depth++;
            else if (!inStr && (c == '}' || c == ']')) depth--;
            else if (!inStr && depth == 0 && c == delim) { out.add(s.substring(start, i)); start = i + 1; }
        }
        if (start < s.length()) out.add(s.substring(start));
        return out;
    }
    static int indexOfTopLevel(String s, char delim) {
        int depth = 0; boolean inStr = false;
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '"' && (i == 0 || s.charAt(i-1) != '\\')) inStr = !inStr;
            else if (!inStr && (c == '{' || c == '[')) depth++;
            else if (!inStr && (c == '}' || c == ']')) depth--;
            else if (!inStr && depth == 0 && c == delim) return i;
        }
        return -1;
    }
    static String escape(String s) { return s == null ? "" : s.replace("\\","\\\\").replace("\"","\\\""); }
    static String sha256(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes());
            return HexFormat.of().formatHex(d);
        } catch (Exception e) { return "0".repeat(64); }
    }
}
