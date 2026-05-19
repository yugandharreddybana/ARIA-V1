package com.aria.governance.controller;

import com.aria.governance.service.LegalContractReaderService;
import com.aria.governance.service.LegalContractReaderService.IngestResult;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;

@RestController
@RequestMapping("/api/governance/contracts")
@RequiredArgsConstructor
public class LegalContractController {

    private final LegalContractReaderService legal;

    public record IngestRequest(
            @NotBlank String vendor,
            @NotBlank String title,
            @NotBlank String rawText,
            Instant signedAt,
            Instant expiresAt,
            @NotBlank String requestedBy) {}

    @PostMapping
    public ResponseEntity<IngestResult> ingest(@Valid @RequestBody IngestRequest req) {
        return ResponseEntity.ok(legal.ingest(
                req.vendor(), req.title(), req.rawText(), req.signedAt(), req.expiresAt(), req.requestedBy()));
    }
}
