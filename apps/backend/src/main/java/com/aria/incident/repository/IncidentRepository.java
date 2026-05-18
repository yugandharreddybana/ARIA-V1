package com.aria.incident.repository;

import com.aria.incident.model.Incident;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface IncidentRepository extends JpaRepository<Incident, UUID> {
    List<Incident> findTop20ByOrderByDetectedAtDesc();
    List<Incident> findByStatus(String status);
}
