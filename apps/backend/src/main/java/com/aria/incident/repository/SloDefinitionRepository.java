package com.aria.incident.repository;

import com.aria.incident.model.SloDefinition;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface SloDefinitionRepository extends JpaRepository<SloDefinition, UUID> {
    Optional<SloDefinition> findByServiceAndName(String service, String name);
}
