package com.aria.graph;

import com.aria.graph.service.DistillationEngine;
import com.aria.graph.model.SemanticChunk;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class DistillationEngineTest {

    @Test
    void extractIntentKeywords_strips_stopwords_and_short_tokens() {
        Set<String> kws = DistillationEngine.extractIntentKeywords(
                "When the user logs in via GitHub we should also rotate refresh tokens");
        assertThat(kws).contains("user", "logs", "github", "rotate", "refresh", "tokens")
                .doesNotContain("the", "in", "we");
    }

    @Test
    void scoreChunk_rewards_symbol_match_more_than_path_match() {
        var symbolMatch = SemanticChunk.builder()
                .symbolName("rotateRefreshTokens").summary("noop").sourceFile("src/util.ts")
                .build();
        var pathOnly = SemanticChunk.builder()
                .symbolName("foo").summary("bar").sourceFile("src/rotate-tokens.ts")
                .build();
        Set<String> kws = Set.of("rotate", "tokens");
        assertThat(DistillationEngine.scoreChunk(symbolMatch, kws))
                .isGreaterThan(DistillationEngine.scoreChunk(pathOnly, kws));
    }

    @Test
    void scoreChunk_applies_recency_bump_for_chunks_under_24h() {
        var fresh = SemanticChunk.builder().symbolName("auth").summary("").sourceFile("a.ts")
                .lastUpdatedAt(Instant.now())
                .build();
        var old   = SemanticChunk.builder().symbolName("auth").summary("").sourceFile("a.ts")
                .lastUpdatedAt(Instant.now().minusSeconds(7 * 86400))
                .build();
        Set<String> kws = Set.of("auth");
        assertThat(DistillationEngine.scoreChunk(fresh, kws))
                .isGreaterThan(DistillationEngine.scoreChunk(old, kws));
    }

    @Test
    void moduleOf_returns_parent_directory() {
        assertThat(DistillationEngine.moduleOf("apps/web/src/page.tsx")).isEqualTo("apps/web/src");
        assertThat(DistillationEngine.moduleOf("noslashfile.ts")).isEqualTo("noslashfile.ts");
        assertThat(DistillationEngine.moduleOf(null)).isEqualTo("");
    }

    @Test
    void approxTokens_rough_4_chars_per_token() {
        assertThat(DistillationEngine.approxTokens("abcdefgh")).isEqualTo(3);  // 8/4 + 1
        assertThat(DistillationEngine.approxTokens(null)).isEqualTo(0);
    }
}
