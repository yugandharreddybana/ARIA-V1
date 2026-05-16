package com.aria;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * Spring context-load smoke test.
 *
 * Disabled because booting the full context pulls in Spring Data JPA repositories that need a
 * live Postgres + pgvector instance. Sprint 14 (V27.9 §18L) wires Testcontainers so this can run
 * unconditionally. Until then, unit tests cover the orchestrator logic and `pnpm dev:up` exercises
 * end-to-end startup.
 */
@SpringBootTest
@ActiveProfiles("test")
@Disabled("Needs Testcontainers Postgres + pgvector — re-enabled in Sprint 14.")
class AriaBackendApplicationTests {

    @Test
    void contextLoads() {
        // see @Disabled
    }
}
