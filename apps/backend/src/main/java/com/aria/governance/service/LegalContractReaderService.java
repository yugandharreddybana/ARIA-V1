package com.aria.governance.service;

import com.aria.governance.model.ComplianceFinding;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * V27.9 §13.7 — Legal / Contract Reader + ToS Watcher.
 *
 * Ingests vendor contracts (already text-extracted upstream — PDF→text is the caller's
 * responsibility so we don't pull a heavyweight PDF dep into the daemon image), stamps a
 * sha256 of the raw text + a license classification, and flags anything copyleft so the
 * Legal Kill-Switch can fire (Sprint 6 §12).
 *
 * Sprint 17 wires the embedding column via the Token Gateway; Sprint 12 leaves it NULL.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LegalContractReaderService {

    private static final Pattern COPYLEFT = Pattern.compile(
        "(?i)\\b(GPL-\\d|AGPL-\\d|LGPL-\\d|MPL-\\d|SSPL-\\d|GNU\\s+(GENERAL\\s+PUBLIC|AFFERO|LESSER))\\b");
    private static final Pattern PERMISSIVE = Pattern.compile(
        "(?i)\\b(MIT|Apache-2\\.0|BSD-(2|3)-Clause|ISC)\\b|Permission is hereby granted, free of charge");
    private static final Pattern PROPRIETARY = Pattern.compile(
        "(?i)\\b(All rights reserved|proprietary and confidential|trade secret)\\b");

    private final JdbcTemplate jdbc;
    private final ComplianceAuditorService compliance;
    private final AuditChainService auditChain;

    public record IngestResult(UUID id, String licenseClass, boolean flagged) {}

    @Transactional
    public IngestResult ingest(String vendor, String title, String rawText, java.time.Instant signedAt, java.time.Instant expiresAt, String requestedBy) {
        String hash = sha256(rawText);
        String licenseClass = classify(rawText);
        boolean flagged = "copyleft".equals(licenseClass);
        UUID id = UUID.randomUUID();
        jdbc.update(
            "INSERT INTO contracts (id, vendor, title, raw_text, raw_hash, signed_at, expires_at, license_class, flagged) " +
            "VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?)",
            id.toString(), vendor, title, rawText, hash,
            signedAt, expiresAt, licenseClass, flagged
        );
        if (flagged) {
            // Trip the Legal Kill-Switch by recording a blocking compliance finding.
            List<ComplianceFinding> findings = compliance.scanDiff("legal-contract", id.toString(),
                    "contracts/" + vendor + "/" + title, rawText);
            log.warn("LEGAL_KILL_SWITCH vendor={} title={} findings={}", vendor, title, findings.size());
        }
        auditChain.appendEvent("legal.contract.ingest", requestedBy, java.util.Map.of(
                "contractId", id.toString(),
                "vendor",     vendor,
                "licenseClass", licenseClass,
                "flagged",    flagged));
        return new IngestResult(id, licenseClass, flagged);
    }

    /** Pure function — used in `LegalContractReaderServiceTest`. */
    public static String classify(String text) {
        if (text == null || text.isEmpty()) return "unknown";
        if (COPYLEFT.matcher(text).find())    return "copyleft";
        if (PROPRIETARY.matcher(text).find()) return "proprietary";
        if (PERMISSIVE.matcher(text).find())  return "permissive";
        return "unknown";
    }

    private static String sha256(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s == null ? new byte[0] : s.getBytes());
            return HexFormat.of().formatHex(d);
        } catch (Exception e) { return "0".repeat(64); }
    }
}
