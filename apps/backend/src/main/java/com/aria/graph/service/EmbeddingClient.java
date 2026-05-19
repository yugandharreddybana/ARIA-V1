package com.aria.graph.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/**
 * Embedding + summary client — routes through the middleware Token Gateway so every call is
 * rate-limited, budgeted, and ReplayFrame-logged.
 *
 * Auth: an internal service token is expected via `ARIA_INTERNAL_SERVICE_TOKEN`. In NO-RUN dev
 * mode the daemon-private key infra is used to mint short-lived tokens (Sprint 12 hardens this).
 *
 * If the gateway is unreachable, both calls return empty / stub values so the rest of the
 * pipeline degrades gracefully (no exceptions thrown into the chunk-build loop).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class EmbeddingClient {

    @Value("${aria.middleware.url:http://localhost:3001}")
    private String middlewareUrl;

    @Value("${aria.internal.service-token:}")
    private String serviceToken;

    private RestClient client() {
        return RestClient.builder()
                .baseUrl(middlewareUrl)
                .defaultHeader("Authorization", "Bearer " + serviceToken)
                .defaultHeader("Content-Type",  "application/json")
                .build();
    }

    /**
     * Returns a 768-dim float[] for the given text via Ollama `nomic-embed-text`. Empty array
     * if the gateway is unreachable. Hits the dedicated /api/llm/embed route added Sprint 8.
     */
    public float[] embed(String text) {
        try {
            Map<?, ?> response = client().post()
                    .uri("/api/llm/embed")
                    .body(Map.of("text", text))
                    .retrieve()
                    .body(Map.class);
            Object data = response != null ? response.get("data") : null;
            if (data instanceof Map<?, ?> m && m.get("embedding") instanceof List<?> raw) {
                float[] out = new float[raw.size()];
                for (int i = 0; i < raw.size(); i++) out[i] = ((Number) raw.get(i)).floatValue();
                return out;
            }
            log.debug("Embedding response missing vector — returning empty");
            return new float[0];
        } catch (Exception ex) {
            log.warn("Embedding call failed: {} — returning empty vector", ex.getMessage());
            return new float[0];
        }
    }

    /** Single-shot natural-language summary of a snippet (capped at ~1-3 sentences). */
    public String summarise(String snippet, String context) {
        try {
            Map<?, ?> response = client().post()
                    .uri("/api/llm/invoke")
                    .body(Map.of(
                        "sessionId", "00000000-0000-0000-0000-000000000000",
                        "agentId",   "concept-graph-builder",
                        "targetBackend", "ollama-default",
                        "priority", "low",
                        "promptTokensEstimated", Math.max(50, snippet.length() / 4),
                        "messages", List.of(
                            Map.of("role", "system", "content",
                                "Summarise the following code/text in one or two sentences. Plain prose, no markdown."),
                            Map.of("role", "user", "content", "Context: " + context + "\n\n" + snippet)
                        )
                    ))
                    .retrieve()
                    .body(Map.class);
            Object data = response != null ? response.get("data") : null;
            if (data instanceof Map<?, ?> m && m.get("responseText") instanceof String s) return s.trim();
            return "";
        } catch (Exception ex) {
            log.warn("Summary call failed: {} — returning empty summary", ex.getMessage());
            return "";
        }
    }

    /**
     * Convenience for callers that already know which embedding model to ask for (Sprint 14
     * Synthetic Data Hydrator uses this with a smaller model on hot paths).
     */
    public float[] embed(String text, String model) {
        try {
            Map<?, ?> response = client().post()
                    .uri("/api/llm/embed")
                    .body(Map.of("text", text, "model", model))
                    .retrieve()
                    .body(Map.class);
            Object data = response != null ? response.get("data") : null;
            if (data instanceof Map<?, ?> m && m.get("embedding") instanceof List<?> raw) {
                float[] out = new float[raw.size()];
                for (int i = 0; i < raw.size(); i++) out[i] = ((Number) raw.get(i)).floatValue();
                return out;
            }
            return new float[0];
        } catch (Exception ex) {
            log.warn("Embedding call failed: {} — returning empty vector", ex.getMessage());
            return new float[0];
        }
    }

    /** Postgres pgvector literal `[1,2,3,...]` from a float[]. */
    public static String toVectorLiteral(float[] vec) {
        if (vec == null || vec.length == 0) return "[]";
        StringBuilder sb = new StringBuilder(vec.length * 9);
        sb.append('[');
        for (int i = 0; i < vec.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(vec[i]);
        }
        sb.append(']');
        return sb.toString();
    }
}
