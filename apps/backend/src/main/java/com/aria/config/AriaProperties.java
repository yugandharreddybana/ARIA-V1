package com.aria.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.validation.annotation.Validated;
import jakarta.validation.constraints.NotBlank;

@ConfigurationProperties(prefix = "aria")
@Validated
public record AriaProperties(
    Jwt jwt,
    Backend backend,
    Ollama ollama
) {
    public record Jwt(@NotBlank String publicKey) {}
    public record Backend(@NotBlank String middlewareUrl) {}
    public record Ollama(@NotBlank String baseUrl, @NotBlank String defaultModel) {}
}
