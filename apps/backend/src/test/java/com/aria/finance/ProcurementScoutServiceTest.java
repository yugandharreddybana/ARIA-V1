package com.aria.finance;

import com.aria.finance.service.ProcurementScoutService;
import com.aria.finance.service.ProcurementScoutService.Candidate;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ProcurementScoutServiceTest {

    @Test
    void score_ranks_high_coverage_low_cost_candidate_first() {
        var a = new Candidate(UUID.randomUUID(), "Alpha", 100, 1.0, 0.99, 0.9);
        var b = new Candidate(UUID.randomUUID(), "Beta",  200, 0.5, 0.95, 0.7);
        var ranked = ProcurementScoutService.score(List.of(b, a), List.of("uptime"));
        ranked.sort((x, y) -> Double.compare(y.score(), x.score()));
        assertThat(ranked.get(0).name()).isEqualTo("Alpha");
    }

    @Test
    void empty_candidates_returns_empty_list() {
        assertThat(ProcurementScoutService.score(List.of(), List.of("anything"))).isEmpty();
    }

    @Test
    void pros_include_full_coverage_flag_when_feature_coverage_max() {
        var a = new Candidate(UUID.randomUUID(), "Alpha", 100, 1.0, 0.99, 0.95);
        var ranked = ProcurementScoutService.score(List.of(a), List.of("x"));
        assertThat(ranked.get(0).pros()).contains("Covers all listed requirements");
        assertThat(ranked.get(0).pros()).contains("SLA ≥ 99% uptime");
    }

    @Test
    void cons_flag_highest_cost_in_a_shortlist() {
        var cheap = new Candidate(UUID.randomUUID(), "Cheap", 100, 0.9, 0.99, 0.9);
        var pricy = new Candidate(UUID.randomUUID(), "Pricy", 500, 0.9, 0.99, 0.9);
        var ranked = ProcurementScoutService.score(List.of(cheap, pricy), List.of("x"));
        var pricyResult = ranked.stream().filter(s -> s.name().equals("Pricy")).findFirst().orElseThrow();
        assertThat(pricyResult.cons()).contains("Highest monthly cost in shortlist");
    }
}
