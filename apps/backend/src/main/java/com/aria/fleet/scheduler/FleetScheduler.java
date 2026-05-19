package com.aria.fleet.scheduler;

import com.aria.fleet.service.DeadlockBreakerService;
import com.aria.fleet.service.HealingGuardrailService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * V27.9 §17.4 + §18I — periodic drivers for the healing cascade DFS and the Deadlock Breaker.
 *
 * Cadence:
 *   - {@link HealingGuardrailService#scan()} every **30 s** so circular waits surface fast.
 *   - {@link DeadlockBreakerService#sweep()} every **60 s** — slower since each sweep requires
 *     agents to have been waiting ≥ 3 min anyway (per ADR-0015).
 *
 * Disabled in unit tests via the `aria.fleet.scheduler.enabled=false` property (the
 * `@ConditionalOnProperty` annotation defaults to enabled, so production / docker boot pick it up).
 */
@Slf4j
@Component
@RequiredArgsConstructor
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(
        prefix = "aria.fleet.scheduler", name = "enabled", havingValue = "true", matchIfMissing = true)
public class FleetScheduler {

    private final HealingGuardrailService guardrail;
    private final DeadlockBreakerService deadlock;

    @Scheduled(fixedDelayString = "${aria.fleet.scheduler.heal-interval-ms:30000}")
    public void runHealingScan() {
        try {
            var cycles = guardrail.scan();
            if (!cycles.isEmpty()) {
                log.warn("FLEET_HEAL_CYCLES_DETECTED count={} cycles={}", cycles.size(), cycles);
            }
        } catch (Exception ex) {
            log.warn("Healing scan failed: {}", ex.getMessage());
        }
    }

    @Scheduled(fixedDelayString = "${aria.fleet.scheduler.deadlock-interval-ms:60000}")
    public void runDeadlockSweep() {
        try {
            var debts = deadlock.sweep();
            if (!debts.isEmpty()) {
                log.warn("FLEET_DEADLOCK_DEBTS_CREATED count={}", debts.size());
            }
        } catch (Exception ex) {
            log.warn("Deadlock sweep failed: {}", ex.getMessage());
        }
    }
}
