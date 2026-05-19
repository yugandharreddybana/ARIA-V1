package com.aria.fleet;

import com.aria.fleet.service.HealingGuardrailService;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class HealingGuardrailServiceTest {

    @Test
    void detectCycles_finds_simple_2_cycle() {
        Map<String, String> g = new LinkedHashMap<>();
        g.put("a", "b");
        g.put("b", "a");
        List<List<String>> cycles = HealingGuardrailService.detectCycles(g);
        assertThat(cycles).hasSize(1);
        assertThat(cycles.get(0)).containsExactlyInAnyOrder("a", "b");
    }

    @Test
    void detectCycles_finds_3_cycle() {
        Map<String, String> g = new LinkedHashMap<>();
        g.put("a", "b");
        g.put("b", "c");
        g.put("c", "a");
        assertThat(HealingGuardrailService.detectCycles(g)).hasSize(1);
    }

    @Test
    void detectCycles_returns_empty_for_acyclic_chain() {
        Map<String, String> g = new LinkedHashMap<>();
        g.put("a", "b");
        g.put("b", "c");
        // c has no outgoing edge — acyclic
        assertThat(HealingGuardrailService.detectCycles(g)).isEmpty();
    }

    @Test
    void detectCycles_ignores_disconnected_acyclic_chains() {
        Map<String, String> g = new LinkedHashMap<>();
        g.put("a", "b");
        g.put("c", "d");
        g.put("d", "c");      // only this is a cycle
        List<List<String>> cycles = HealingGuardrailService.detectCycles(g);
        assertThat(cycles).hasSize(1);
        assertThat(cycles.get(0)).containsExactlyInAnyOrder("c", "d");
    }
}
