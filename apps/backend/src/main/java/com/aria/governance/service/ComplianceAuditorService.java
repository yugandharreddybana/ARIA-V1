package com.aria.governance.service;

import com.aria.governance.model.ComplianceFinding;
import com.aria.governance.repository.ComplianceFindingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * V27.9 §12 + §13.7 — Compliance Auditor.
 *
 * Sprint 12 ships:
 *   - {@link #scanDiff(String, String, String, String)} — regex-based PII / logging / retention
 *     / encryption / data-export / data-residency detector over a diff blob.
 *   - {@link #decide(UUID, String, String)} — accept / reject / mitigate transitions.
 *
 * Sprint 17 will graduate the detector to a model-based grader; the result schema (status,
 * category, severity) is locked here so the call sites stay stable.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ComplianceAuditorService {

    public static final String CATEGORY_PII             = "pii";
    public static final String CATEGORY_LOGGING         = "logging";
    public static final String CATEGORY_RETENTION       = "retention";
    public static final String CATEGORY_ENCRYPTION      = "encryption";
    public static final String CATEGORY_DATA_EXPORT     = "data_export";
    public static final String CATEGORY_DATA_RESIDENCY  = "data_residency";

    private final ComplianceFindingRepository findings;
    private final AuditChainService auditChain;

    /** Rule shape: a regex + category + severity + human description. */
    record Rule(Pattern pattern, String category, String severity, String description) {}

    private static final List<Rule> RULES = List.of(
        new Rule(Pattern.compile("(?i)\\b(email|phone|ssn|tax_id|date_of_birth|dob|passport|driver_license)\\b"),
                 CATEGORY_PII, "blocking",
                 "PII column reference detected — confirm hashing / encryption + retention rule"),
        new Rule(Pattern.compile("(?i)console\\.log\\s*\\(.*\\b(email|password|token|secret|key)\\b"),
                 CATEGORY_LOGGING, "blocking",
                 "Secret-bearing console.log shipped — must be replaced with redacted structured logging"),
        new Rule(Pattern.compile("(?i)\\bSELECT\\s+\\*\\s+FROM\\s+(users|refresh_tokens|sessions)\\b"),
                 CATEGORY_PII, "warning",
                 "SELECT * on a PII-bearing table — enumerate columns to prevent accidental over-exposure"),
        new Rule(Pattern.compile("(?i)\\bbcrypt\\b\\s*\\.\\s*hash(Sync)?\\s*\\([^,]+,\\s*[0-9]\\s*\\)"),
                 CATEGORY_ENCRYPTION, "blocking",
                 "bcrypt cost factor < 10 detected — Sprint 1 baseline requires cost factor 12"),
        new Rule(Pattern.compile("(?i)\\bRETENTION\\s+(\\d+)\\s+DAY"),
                 CATEGORY_RETENTION, "warning",
                 "Explicit retention period change — Compliance Auditor must sign off"),
        new Rule(Pattern.compile("(?i)\\bres\\.send\\s*\\(.*\\b(users|customers)\\b"),
                 CATEGORY_DATA_EXPORT, "warning",
                 "Bulk export of users / customers from a REST handler — confirm RBAC + redaction"),
        new Rule(Pattern.compile("(?i)\\b(eu-central|us-east|ap-southeast)-[0-9]\\b"),
                 CATEGORY_DATA_RESIDENCY, "info",
                 "Cloud region literal — confirm data residency requirement matches the destination region")
    );

    /**
     * Scan one diff blob and persist any findings. `triggerRef` is opaque to the auditor —
     * pass the PR number, commit sha, or file path so the dashboard can link back.
     */
    @Transactional
    public List<ComplianceFinding> scanDiff(String triggeredBy, String triggerRef, String diffPath, String diffBlob) {
        if (diffBlob == null || diffBlob.isEmpty()) return List.of();
        List<ComplianceFinding> out = new ArrayList<>();
        for (Rule r : RULES) {
            Matcher m = r.pattern.matcher(diffBlob);
            int hits = 0;
            while (m.find() && hits < 5) hits++;
            if (hits == 0) continue;
            ComplianceFinding f = ComplianceFinding.builder()
                    .triggeredBy(triggeredBy)
                    .triggerRef(triggerRef)
                    .category(r.category)
                    .severity(r.severity)
                    .description(r.description + " (matches=" + hits + ", path=" + diffPath + ")")
                    .evidence("{\"matches\":" + hits + ",\"path\":\"" + escape(diffPath) + "\"}")
                    .build();
            findings.save(f);
            out.add(f);
            auditChain.appendEvent("compliance.finding", "compliance-auditor",
                Map.of("findingId", f.getId().toString(), "category", r.category, "severity", r.severity));
        }
        log.info("COMPLIANCE_SCAN triggered_by={} ref={} findings={}", triggeredBy, triggerRef, out.size());
        return out;
    }

    @Transactional(readOnly = true)
    public List<ComplianceFinding> open() { return findings.findByStatus("open"); }

    @Transactional(readOnly = true)
    public List<ComplianceFinding> recent() { return findings.findTop50ByOrderByCreatedAtDesc(); }

    @Transactional
    public ComplianceFinding decide(UUID id, String decidedBy, String to) {
        if (!Set.of("accepted","rejected","mitigated").contains(to)) {
            throw new IllegalArgumentException("Invalid decision: " + to);
        }
        ComplianceFinding f = findings.findById(id).orElseThrow();
        f.setStatus(to);
        f.setDecidedBy(decidedBy);
        f.setDecidedAt(Instant.now());
        ComplianceFinding saved = findings.save(f);
        auditChain.appendEvent("compliance.decision", decidedBy,
            Map.of("findingId", id.toString(), "decision", to));
        return saved;
    }

    private static String escape(String s) { return s == null ? "" : s.replace("\"", "\\\""); }
}
