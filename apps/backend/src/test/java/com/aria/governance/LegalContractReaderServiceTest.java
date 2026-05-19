package com.aria.governance;

import com.aria.governance.service.LegalContractReaderService;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class LegalContractReaderServiceTest {

    @Test
    void classify_copyleft_takes_precedence_over_permissive() {
        String text = "Includes MIT components but is itself distributed under the GNU GENERAL PUBLIC LICENSE v3.";
        assertThat(LegalContractReaderService.classify(text)).isEqualTo("copyleft");
    }

    @Test
    void classify_permissive_mit() {
        assertThat(LegalContractReaderService.classify("SPDX-License-Identifier: MIT"))
                .isEqualTo("permissive");
    }

    @Test
    void classify_proprietary_keywords() {
        assertThat(LegalContractReaderService.classify("Copyright Acme. All rights reserved."))
                .isEqualTo("proprietary");
    }

    @Test
    void classify_unknown_when_nothing_matches() {
        assertThat(LegalContractReaderService.classify("a random plaintext paragraph without any licensing keywords"))
                .isEqualTo("unknown");
    }

    @Test
    void classify_handles_null_and_empty() {
        assertThat(LegalContractReaderService.classify(null)).isEqualTo("unknown");
        assertThat(LegalContractReaderService.classify("")).isEqualTo("unknown");
    }
}
