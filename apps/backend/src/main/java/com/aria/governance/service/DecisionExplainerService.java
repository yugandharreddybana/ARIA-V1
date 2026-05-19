package com.aria.governance.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.*;

/**
 * V27.9 §20 — Decision Explainer. `/aria explain <sessionId>` produces a markdown why-trace
 * built from already-recorded evidence (ReplayFrames + Outcome Objects + ADRs + audit chain).
 *
 * Sprint 12 ships a deterministic stitch over `replay_frames` + `audit_chain`. Sprint 17
 * Meta-Evolution will optionally summarise via Claude (gated by ANTHROPIC_ENABLED).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DecisionExplainerService {

    private final JdbcTemplate jdbc;
    private final AuditChainService auditChain;

    public record Explanation(UUID id, String whyMarkdown, Map<String, Object> sources, String chainHash) {}

    @Transactional
    public Explanation explain(UUID sessionId) {
        // Pull the timeline.
        List<Map<String, Object>> frames = jdbc.queryForList(
            "SELECT created_at, agent_id, skill_slug, model_backend, priority, status, prompt_hash, response_hash " +
            "FROM replay_frames WHERE session_id = ? ORDER BY created_at ASC LIMIT 200",
            sessionId);
        List<Map<String, Object>> auditEvents = jdbc.queryForList(
            "SELECT seq, event_type, actor, payload::text AS payload, created_at " +
            "FROM audit_chain " +
            "WHERE payload @> ?::jsonb OR actor = ? " +
            "ORDER BY seq ASC LIMIT 200",
            "{\"sessionId\":\"" + sessionId + "\"}", sessionId.toString());

        StringBuilder md = new StringBuilder();
        md.append("# Why did ARIA do this? — session `").append(sessionId).append("`\n\n");
        md.append("Generated from ").append(frames.size()).append(" replay frame(s) and ")
          .append(auditEvents.size()).append(" governance audit event(s).\n\n");

        md.append("## Replay timeline\n\n");
        if (frames.isEmpty()) md.append("_No LLM calls recorded for this session._\n\n");
        for (Map<String, Object> f : frames) {
            md.append("- `").append(f.get("created_at")).append("` agent=`").append(f.get("agent_id"))
              .append("` skill=`").append(f.get("skill_slug"))
              .append("` backend=`").append(f.get("model_backend"))
              .append("` priority=`").append(f.get("priority"))
              .append("` status=`").append(f.get("status")).append("`\n");
        }

        md.append("\n## Governance events\n\n");
        if (auditEvents.isEmpty()) md.append("_No governance events linked to this session._\n\n");
        for (Map<String, Object> e : auditEvents) {
            md.append("- `seq=").append(e.get("seq")).append("` `").append(e.get("event_type"))
              .append("` by `").append(e.get("actor")).append("` at `").append(e.get("created_at")).append("`\n");
        }

        md.append("\n_This explanation is generated from recorded evidence only — no new LLM call is made " +
                  "(per V27.9 §20 Decision Explainer)._\n");

        Map<String, Object> sources = Map.of(
                "replay_frame_count", frames.size(),
                "audit_event_count",  auditEvents.size());

        String chainHash = auditChain.appendEvent("explain.emit", "decision-explainer",
                Map.of("sessionId", sessionId.toString(),
                       "frames", frames.size(),
                       "events", auditEvents.size()));

        UUID id = UUID.randomUUID();
        jdbc.update(
            "INSERT INTO decision_explanations (id, session_id, why_markdown, sources_jsonb, chain_hash) " +
            "VALUES (?::uuid, ?::uuid, ?, ?::jsonb, ?)",
            id.toString(), sessionId.toString(), md.toString(),
            "{\"replay_frame_count\":" + frames.size() + ",\"audit_event_count\":" + auditEvents.size() + "}",
            chainHash);
        return new Explanation(id, md.toString(), sources, chainHash);
    }
}
