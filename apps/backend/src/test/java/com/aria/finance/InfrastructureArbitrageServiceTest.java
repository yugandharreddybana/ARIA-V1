package com.aria.finance;

import com.aria.finance.service.InfrastructureArbitrageService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class InfrastructureArbitrageServiceTest {

    @Test
    void stateful_cross_cloud_is_high_risk() {
        assertThat(InfrastructureArbitrageService.classifyRisk("postgres", "aws-rds", "gcp-cloudsql"))
                .isEqualTo("high");
    }

    @Test
    void stateful_same_cloud_is_medium_risk() {
        assertThat(InfrastructureArbitrageService.classifyRisk("redis", "aws-elasticache", "aws-memorydb"))
                .isEqualTo("medium");
    }

    @Test
    void stateless_cross_cloud_is_medium_risk() {
        assertThat(InfrastructureArbitrageService.classifyRisk("nginx", "aws-ec2", "gcp-compute"))
                .isEqualTo("medium");
    }

    @Test
    void stateless_same_cloud_is_low_risk() {
        assertThat(InfrastructureArbitrageService.classifyRisk("nginx", "aws-ec2", "aws-ecs"))
                .isEqualTo("low");
    }

    @Test
    void null_inputs_default_to_high_risk() {
        assertThat(InfrastructureArbitrageService.classifyRisk(null, "aws", "gcp")).isEqualTo("high");
    }
}
