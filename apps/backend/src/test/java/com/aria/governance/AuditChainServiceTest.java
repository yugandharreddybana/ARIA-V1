package com.aria.governance;

import com.aria.governance.service.AuditChainService;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AuditChainServiceTest {

    @Test
    void canonical_sorts_keys_and_joins_with_pipe() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("b", 2);
        m.put("a", 1);
        String c = AuditChainService.canonical(m);
        assertThat(c).isEqualTo("a=1|b=2");
    }

    @Test
    void canonical_handles_empty_and_null() {
        assertThat(AuditChainService.canonical(null)).isEmpty();
        assertThat(AuditChainService.canonical(new LinkedHashMap<>())).isEmpty();
    }

    @Test
    void toJson_emits_stable_ordering_and_escapes_quotes() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("b", "he\"y");
        m.put("a", 1);
        String json = AuditChainService.toJson(m);
        assertThat(json).isEqualTo("{\"a\":1,\"b\":\"he\\\"y\"}");
    }

    @Test
    void sha256_is_deterministic() {
        assertThat(AuditChainService.sha256("x")).isEqualTo(AuditChainService.sha256("x"));
        assertThat(AuditChainService.sha256("x")).isNotEqualTo(AuditChainService.sha256("y"));
    }
}
