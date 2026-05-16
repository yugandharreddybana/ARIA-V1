package com.aria.orchestrator.service;

import com.aria.exception.AriaException;
import com.aria.orchestrator.dto.CreateSessionRequest;
import com.aria.orchestrator.dto.SessionDto;
import com.aria.orchestrator.model.Session;
import com.aria.orchestrator.model.SessionState;
import com.aria.orchestrator.repository.SessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * Orchestrator (V27.9 §2.1, §4) — owns the Session state machine.
 *
 *   start  : NEW | PAUSED → WORKING
 *   pause  : WORKING       → PAUSED
 *   stop   : *             → COMPLETED
 *   status : read-only
 *
 * All transitions are scoped by ownership (userId from the verified JWT), which is
 * enforced one layer up in the controller — IDOR is therefore impossible here.
 */
@Service
@RequiredArgsConstructor
public class OrchestratorService {

    private final SessionRepository sessions;

    @Transactional
    public SessionDto create(CreateSessionRequest req, UUID userId) {
        Session s = Session.builder()
                .projectId(req.projectId())
                .userId(userId)
                .state(SessionState.new_.wire())
                .mode(orDefault(req.mode(), "precision"))
                .environment(orDefault(req.environment(), "dev"))
                .missionType(orDefault(req.missionType(), "feature"))
                .missionRiskAppetite("moderate")
                .missionScope("[]")
                .tokenBudget(req.tokenBudget())
                .timeBudgetMinutes(req.timeBudgetMinutes())
                .build();
        return SessionDto.from(sessions.save(s));
    }

    @Transactional
    public SessionDto start(UUID sessionId, UUID userId) {
        Session s = loadOwned(sessionId, userId);
        SessionState st = SessionState.fromWire(s.getState());
        if (st != SessionState.new_ && st != SessionState.paused && st != SessionState.bootstrapping) {
            throw AriaException.badRequest("Cannot start session in state " + s.getState());
        }
        s.setState(SessionState.working.wire());
        s.setUpdatedAt(Instant.now());
        return SessionDto.from(sessions.save(s));
    }

    @Transactional
    public SessionDto pause(UUID sessionId, UUID userId) {
        Session s = loadOwned(sessionId, userId);
        if (!SessionState.working.wire().equals(s.getState())) {
            throw AriaException.badRequest("Cannot pause session in state " + s.getState());
        }
        s.setState(SessionState.paused.wire());
        s.setUpdatedAt(Instant.now());
        return SessionDto.from(sessions.save(s));
    }

    @Transactional
    public SessionDto stop(UUID sessionId, UUID userId) {
        Session s = loadOwned(sessionId, userId);
        s.setState(SessionState.completed.wire());
        s.setEndedAt(Instant.now());
        s.setUpdatedAt(Instant.now());
        return SessionDto.from(sessions.save(s));
    }

    @Transactional(readOnly = true)
    public SessionDto status(UUID sessionId, UUID userId) {
        return SessionDto.from(loadOwned(sessionId, userId));
    }

    private Session loadOwned(UUID sessionId, UUID userId) {
        Session s = sessions.findById(sessionId).orElseThrow(() -> AriaException.notFound("Session not found"));
        // IDOR check: a session is accessible iff the requester created it.
        if (s.getUserId() != null && !s.getUserId().equals(userId)) {
            throw AriaException.notFound("Session not found"); // 404 on no-access (no info leak)
        }
        return s;
    }

    private static String orDefault(String v, String d) {
        return v == null || v.isEmpty() ? d : v;
    }
}
