package com.aria.incident.config;

import com.aria.incident.model.SloDefinition;
import com.aria.incident.repository.SloDefinitionRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;

/**
 * V27.9 §17 + ADR-0011 — sync `.entiresystem/slos.yml` into `slo_definitions` on boot.
 *
 * One-way: file → DB. Dependency-free YAML parser (same shape Migration Orchestrator uses).
 * If the file is missing the boot succeeds silently (local dev convenience).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SloBootstrap {

    private final SloDefinitionRepository repo;

    @Value("${aria.slos.path:.entiresystem/slos.yml}")
    private String sloPath;

    @PostConstruct
    public void syncFromFile() {
        Path p = Path.of(sloPath);
        if (!Files.exists(p)) {
            log.info("SLO bootstrap: {} not present — skipping", sloPath);
            return;
        }
        try {
            List<ParsedSlo> entries = parse(Files.readString(p));
            int added = 0, updated = 0;
            for (ParsedSlo s : entries) {
                var existing = repo.findByServiceAndName(s.service, s.name);
                SloDefinition def = existing.orElseGet(() -> SloDefinition.builder().build());
                def.setService(s.service);
                def.setName(s.name);
                def.setMetric(s.metric);
                def.setThreshold(BigDecimal.valueOf(s.threshold));
                def.setComparison(s.comparison);
                def.setWindowSeconds(s.windowSeconds);
                def.setDescription(s.description);
                repo.save(def);
                if (existing.isPresent()) updated++; else added++;
            }
            log.info("SLO bootstrap: {} added / {} updated from {}", added, updated, sloPath);
        } catch (IOException e) {
            log.warn("SLO bootstrap failed: {}", e.getMessage());
        }
    }

    record ParsedSlo(String service, String name, String metric, double threshold,
                     String comparison, int windowSeconds, String description) {}

    static List<ParsedSlo> parse(String yaml) {
        List<ParsedSlo> out = new ArrayList<>();
        String service = null, name = null, metric = null, comparison = null, description = null;
        double threshold = 0;
        int windowSeconds = 300;
        boolean inItem = false;
        for (String raw : yaml.split("\n")) {
            String line = raw.replace("\r", "");
            if (line.startsWith("slos:")) continue;
            if (line.matches("^\\s*-\\s+service:.*")) {
                if (inItem && service != null && name != null)
                    out.add(new ParsedSlo(service, name, metric, threshold, comparison, windowSeconds, description));
                inItem = true;
                service = unquote(line.replaceAll("^\\s*-\\s+service:\\s*", ""));
                name = null; metric = null; comparison = "<"; description = null;
                threshold = 0; windowSeconds = 300;
            } else if (line.matches("^\\s+name:.*"))         name        = unquote(line.replaceAll("^\\s+name:\\s*", ""));
            else if (line.matches("^\\s+metric:.*"))         metric      = unquote(line.replaceAll("^\\s+metric:\\s*", ""));
            else if (line.matches("^\\s+threshold:.*")) {
                try { threshold = Double.parseDouble(unquote(line.replaceAll("^\\s+threshold:\\s*", ""))); }
                catch (NumberFormatException ignored) {}
            }
            else if (line.matches("^\\s+comparison:.*"))     comparison  = unquote(line.replaceAll("^\\s+comparison:\\s*", ""));
            else if (line.matches("^\\s+window_seconds:.*")) {
                try { windowSeconds = Integer.parseInt(unquote(line.replaceAll("^\\s+window_seconds:\\s*", ""))); }
                catch (NumberFormatException ignored) {}
            }
            else if (line.matches("^\\s+description:.*"))    description = unquote(line.replaceAll("^\\s+description:\\s*", ""));
        }
        if (inItem && service != null && name != null)
            out.add(new ParsedSlo(service, name, metric, threshold, comparison, windowSeconds, description));
        return out;
    }

    private static String unquote(String s) {
        s = s.trim();
        if (s.startsWith("\"") && s.endsWith("\"") && s.length() >= 2) return s.substring(1, s.length() - 1);
        return s;
    }
}
