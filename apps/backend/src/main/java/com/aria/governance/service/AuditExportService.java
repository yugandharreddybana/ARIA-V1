package com.aria.governance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.file.*;
import java.security.*;
import java.security.spec.PKCS8EncodedKeySpec;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * V27.9 §20 — `/aria export-audit-trail`.
 *
 * Streams a chunk of `audit_chain` (default everything since the last export) to a signed,
 * sha256-checksummed JSON bundle. The signing key is the daemon's Ed25519 private key from
 * `aria.audit.signing-key-pkcs8` (base64 PKCS8). The public key fingerprint is recorded as
 * `signed_by` so reviewers can verify the signature with the committed
 * `.entiresystem/keys/daemon.pub`.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuditExportService {

    @Value("${aria.audit.export-dir:.aria/audit-exports}")
    private String exportDir;

    @Value("${aria.audit.signing-key-pkcs8:}")
    private String signingKeyB64;

    @Value("${aria.audit.signing-key-fingerprint:daemon}")
    private String signingFingerprint;

    private final JdbcTemplate jdbc;
    private final AuditChainService auditChain;

    public record AuditExportResult(UUID id, String bundlePath, String bundleSha256, String signature, long fromSeq, long toSeq) {}

    @Transactional
    public AuditExportResult export(String requestedBy, String scope) {
        long toSeq   = auditChain.currentSeq();
        long fromSeq = jdbc.queryForObject(
            "SELECT COALESCE(MAX(to_seq), 0) + 1 FROM audit_exports", Long.class);
        if (fromSeq == null) fromSeq = 1L;

        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT seq, event_type, actor, payload::text AS payload, prev_hash, chain_hash, created_at " +
            "FROM audit_chain WHERE seq BETWEEN ? AND ? ORDER BY seq ASC",
            fromSeq, toSeq);

        StringBuilder body = new StringBuilder();
        body.append("{\"scope\":\"").append(scope).append("\",")
            .append("\"from_seq\":").append(fromSeq).append(',')
            .append("\"to_seq\":").append(toSeq).append(',')
            .append("\"events\":[");
        for (int i = 0; i < rows.size(); i++) {
            Map<String, Object> r = rows.get(i);
            if (i > 0) body.append(',');
            body.append("{\"seq\":").append(r.get("seq")).append(',')
                .append("\"event_type\":\"").append(escape((String) r.get("event_type"))).append("\",")
                .append("\"actor\":\"").append(escape((String) r.get("actor"))).append("\",")
                .append("\"payload\":").append(r.get("payload")).append(',')
                .append("\"prev_hash\":\"").append(safe((String) r.get("prev_hash"))).append("\",")
                .append("\"chain_hash\":\"").append(safe((String) r.get("chain_hash"))).append("\",")
                .append("\"created_at\":\"").append(r.get("created_at")).append("\"}");
        }
        body.append("]}");
        String bundle = body.toString();
        String sha256 = sha256(bundle);

        try {
            Path dir = Path.of(exportDir);
            Files.createDirectories(dir);
            Path file = dir.resolve(scope + "_" + fromSeq + "_" + toSeq + ".json");
            Files.writeString(file, bundle, StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING);
            String signature = sign(sha256);

            UUID id = UUID.randomUUID();
            jdbc.update(
                "INSERT INTO audit_exports (id, requested_by, scope, from_seq, to_seq, bundle_path, bundle_sha256, signed_by, signature) " +
                "VALUES (?::uuid, ?, ?, ?, ?, ?, ?, ?, ?)",
                id.toString(), requestedBy, scope, fromSeq, toSeq,
                file.toString(), sha256, signingFingerprint, signature);

            auditChain.appendEvent("audit.export", requestedBy, Map.of(
                    "scope", scope, "from_seq", fromSeq, "to_seq", toSeq, "bundle_sha256", sha256));
            log.info("AUDIT_EXPORT scope={} from={} to={} bundle={}", scope, fromSeq, toSeq, file);
            return new AuditExportResult(id, file.toString(), sha256, signature, fromSeq, toSeq);
        } catch (IOException ex) {
            throw new RuntimeException("Audit export write failed: " + ex.getMessage(), ex);
        }
    }

    private String sign(String sha256) {
        if (signingKeyB64 == null || signingKeyB64.isEmpty()) return "unsigned";
        try {
            byte[] pkcs8 = Base64.getDecoder().decode(signingKeyB64);
            PrivateKey priv = KeyFactory.getInstance("Ed25519").generatePrivate(new PKCS8EncodedKeySpec(pkcs8));
            Signature s = Signature.getInstance("Ed25519");
            s.initSign(priv);
            s.update(sha256.getBytes());
            return Base64.getEncoder().encodeToString(s.sign());
        } catch (GeneralSecurityException e) {
            log.warn("Audit export signing failed: {}", e.getMessage());
            return "unsigned";
        }
    }

    static String safe(String s) { return s == null ? "" : escape(s); }
    static String escape(String s) { return s == null ? "" : s.replace("\\","\\\\").replace("\"","\\\""); }
    static String sha256(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes());
            return HexFormat.of().formatHex(d);
        } catch (Exception e) { return "0".repeat(64); }
    }
}
