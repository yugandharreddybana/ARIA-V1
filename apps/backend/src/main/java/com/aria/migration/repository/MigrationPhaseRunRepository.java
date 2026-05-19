package com.aria.migration.repository;

import com.aria.migration.model.MigrationPhaseRun;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MigrationPhaseRunRepository extends JpaRepository<MigrationPhaseRun, UUID> {
    List<MigrationPhaseRun> findByPlaybookIdOrderByPhaseIndexAsc(UUID playbookId);
}
