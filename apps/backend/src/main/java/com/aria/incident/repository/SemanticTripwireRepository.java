package com.aria.incident.repository;

import com.aria.incident.model.SemanticTripwire;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SemanticTripwireRepository extends JpaRepository<SemanticTripwire, UUID> {
    Optional<SemanticTripwire> findByHoneypot(String honeypot);
}
