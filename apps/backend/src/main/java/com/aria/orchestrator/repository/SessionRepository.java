package com.aria.orchestrator.repository;

import com.aria.orchestrator.model.Session;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SessionRepository extends JpaRepository<Session, UUID> {
    Optional<Session> findByIdAndProjectId(UUID id, UUID projectId);
}
