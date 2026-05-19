package com.aria.fleet.repository;

import com.aria.fleet.model.FleetOutcome;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface FleetOutcomeRepository extends JpaRepository<FleetOutcome, UUID> {
    List<FleetOutcome> findTop100ByEpicIdOrderByCreatedAtDesc(String epicId);
    List<FleetOutcome> findTop50ByOrderByCreatedAtDesc();
}
