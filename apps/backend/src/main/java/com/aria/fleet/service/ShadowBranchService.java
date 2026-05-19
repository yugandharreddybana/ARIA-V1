package com.aria.fleet.service;

import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HexFormat;
import java.util.UUID;

/**
 * V27.9 §17.4 — Pre-Cog Speculative Execution.
 *
 * Sprint 10 records the shadow branch row + speculative diff. Sprint 14 ships the actual
 * git operations + auto-revert on ticket re-prioritisation. The branch name format is
 * `aria-shadow/<ticket-ref>` — production code MUST NEVER merge from this prefix
 * (Anti-Slop Gate Sprint 14 extension).
 */
@Slf4j
@Service
public class ShadowBranchService {

    private final JdbcTemplate jdbc;

    public ShadowBranchService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public String open(String ticketRef, String speculativeDiff) {
        String safe = (ticketRef == null ? "unknown" : ticketRef).replaceAll("[^A-Za-z0-9_.-]", "_");
        String branch = "aria-shadow/" + safe;
        UUID id = UUID.randomUUID();
        jdbc.update(
            "INSERT INTO shadow_branches (id, ticket_ref, branch_name, speculative_diff, status) " +
            "VALUES (?::uuid, ?, ?, ?, 'open') " +
            "ON CONFLICT (branch_name) DO UPDATE SET speculative_diff = EXCLUDED.speculative_diff",
            id.toString(), ticketRef, branch, speculativeDiff
        );
        log.info("SHADOW_BRANCH_OPENED ticket={} branch={} id={}", ticketRef, branch, id);
        return branch;
    }

    @Transactional
    public void revert(String branchName, String reason) {
        int rows = jdbc.update(
            "UPDATE shadow_branches SET status='reverted', resolved_at = NOW() WHERE branch_name = ?",
            branchName);
        log.info("SHADOW_BRANCH_REVERTED branch={} reason={} rows={}", branchName, reason, rows);
    }

    /** Stable sha-8 suffix helper for callers that want deterministic shadow branch names. */
    public static String sha8(String input) {
        try {
            byte[] d = java.security.MessageDigest.getInstance("SHA-256").digest(input.getBytes());
            return HexFormat.of().formatHex(d).substring(0, 8);
        } catch (Exception e) { return "00000000"; }
    }
}
