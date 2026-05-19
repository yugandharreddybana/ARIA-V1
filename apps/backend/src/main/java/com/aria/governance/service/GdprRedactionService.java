package com.aria.governance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.Map;

/**
 * V27.9 §12 + ADR-0020 — GDPR / CCPA redaction.
 *
 * Replaces PII with a `[REDACTED:<sha8>]` stub while preserving the audit hash chain so
 * post-hoc deletion is provable (no record was inserted or modified after the fact).
 *
 * Invariants:
 *   - Original value is NEVER stored; only `sha256(original)` is kept in `gdpr_redactions`.
 *   - `redacted_token` is stable per `(table, id, column)` so re-redactions of the same row
 *     produce the same stub (idempotent).
 *   - Append-only chain: `chain_hash = sha256(prev_chain_hash || redacted_token || iso_ts)`.
 *
 * The actual UPDATE on the source table is the caller's responsibility (they know the SQL
 * dialect of the column being redacted). This service computes + persists the metadata.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GdprRedactionService {

    private final JdbcTemplate jdbc;
    private final AuditChainService auditChain;

    public record RedactionRecord(String redactedToken, String chainHash) {}

    @Transactional
    public RedactionRecord redact(String table, String sourceId, String column, String originalValue,
                                  String reason, String requestedBy) {
        String origHash    = sha256(originalValue == null ? "" : originalValue);
        String redactedTok = "[REDACTED:" + sha256(table + "|" + sourceId + "|" + column).substring(0, 8) + "]";

        String prevChain = jdbc.query(
            "SELECT chain_hash FROM gdpr_redactions ORDER BY redacted_at DESC LIMIT 1",
            rs -> rs.next() ? rs.getString(1) : null);
        String ts        = java.time.Instant.now().toString();
        String chainHash = sha256((prevChain == null ? "" : prevChain) + "|" + redactedTok + "|" + ts);

        jdbc.update(
            "INSERT INTO gdpr_redactions (source_table, source_id, source_column, original_value_hash, " +
            "redacted_token, reason, redacted_by, prev_chain_hash, chain_hash) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            table, sourceId, column, origHash, redactedTok, reason, requestedBy, prevChain, chainHash);

        auditChain.appendEvent("gdpr.redaction", requestedBy, Map.of(
                "table", table, "source_id", sourceId, "column", column,
                "reason", reason, "redacted_token", redactedTok));

        log.info("GDPR_REDACTION table={} id={} col={} reason={} token={}",
                table, sourceId, column, reason, redactedTok);
        return new RedactionRecord(redactedTok, chainHash);
    }

    static String sha256(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes());
            return HexFormat.of().formatHex(d);
        } catch (Exception e) { return "0".repeat(64); }
    }
}
