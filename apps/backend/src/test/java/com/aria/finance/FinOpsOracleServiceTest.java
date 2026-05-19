package com.aria.finance;

import com.aria.finance.service.FinOpsOracleService;
import com.aria.finance.service.FinOpsOracleService.EstimateInput;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;

class FinOpsOracleServiceTest {

    @Test
    void estimate_zero_tokens_zero_compute_returns_zero() {
        var est = FinOpsOracleService.estimate(new EstimateInput(0, 0, 0, BigDecimal.ZERO, false));
        assertThat(est.totalUsd()).isEqualByComparingTo("0.0000");
    }

    @Test
    void remote_backend_charges_per_kilo_token_usd() {
        var est = FinOpsOracleService.estimate(new EstimateInput(1_000_000, 0, 0, BigDecimal.ZERO, true));
        // 1_000_000 tokens at $3/k = $3 per 1000 tokens? Actually rate is per 1000 tokens.
        // 1,000,000 / 1000 = 1000 * $3 = $3000.
        assertThat(est.tokensUsd()).isEqualByComparingTo("3000.0000");
    }

    @Test
    void local_backend_token_cost_is_zero() {
        var est = FinOpsOracleService.estimate(new EstimateInput(1_000_000, 0, 0, BigDecimal.ZERO, false));
        assertThat(est.tokensUsd()).isEqualByComparingTo("0.0000");
    }

    @Test
    void compute_minutes_and_storage_are_additive() {
        var est = FinOpsOracleService.estimate(new EstimateInput(0, 100, 10, BigDecimal.ZERO, false));
        // 100 min * $0.01 = $1.00; 10 GB-day * $0.0008 = $0.008
        assertThat(est.computeUsd()).isEqualByComparingTo("1.0000");
        assertThat(est.storageUsd()).isEqualByComparingTo("0.0080");
        assertThat(est.totalUsd()).isEqualByComparingTo("1.0080");
    }

    @Test
    void third_party_usd_is_pass_through() {
        var est = FinOpsOracleService.estimate(new EstimateInput(0, 0, 0, new BigDecimal("12.50"), false));
        assertThat(est.thirdPartyUsd()).isEqualByComparingTo("12.50");
        assertThat(est.totalUsd()).isEqualByComparingTo("12.5000");
    }
}
