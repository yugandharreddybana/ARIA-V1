package com.aria.finance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.UUID;

/**
 * V27.9 §11 — Corporate Treasury — Stripe Issuing MCP stub.
 *
 * `issue()` records a virtual card row; Sprint 17 swaps the implementation for a real Stripe
 * Issuing client behind the same `(vendor, limit)` signature. Sprint 13 logs a deterministic
 * `ic_<sha12>` card id so the dashboard has something to render without a live key.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CorporateTreasuryService {

    private final JdbcTemplate jdbc;

    public record VirtualCard(UUID id, UUID vendorId, String stripeCardId, String last4, BigDecimal spendLimitUsd, String status) {}

    @Transactional
    public VirtualCard issue(UUID vendorId, BigDecimal spendLimitUsd) {
        String stripeCardId = "ic_" + sha12(vendorId + "|" + spendLimitUsd + "|" + System.nanoTime());
        String last4        = stripeCardId.substring(stripeCardId.length() - 4).toUpperCase();
        UUID id             = UUID.randomUUID();
        jdbc.update(
            "INSERT INTO virtual_cards (id, vendor_id, stripe_card_id, last4, spend_limit_usd, status) " +
            "VALUES (?::uuid, ?::uuid, ?, ?, ?, 'active')",
            id.toString(), vendorId == null ? null : vendorId.toString(), stripeCardId, last4, spendLimitUsd);
        log.info("VIRTUAL_CARD_ISSUED card_id={} vendor={} limit={}", stripeCardId, vendorId, spendLimitUsd);
        return new VirtualCard(id, vendorId, stripeCardId, last4, spendLimitUsd, "active");
    }

    @Transactional
    public void freeze(String stripeCardId, String reason) {
        jdbc.update("UPDATE virtual_cards SET status = 'frozen' WHERE stripe_card_id = ?", stripeCardId);
        log.warn("VIRTUAL_CARD_FROZEN card_id={} reason={}", stripeCardId, reason);
    }

    private static String sha12(String s) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(s.getBytes());
            return HexFormat.of().formatHex(d).substring(0, 12);
        } catch (Exception e) { return "000000000000"; }
    }
}
