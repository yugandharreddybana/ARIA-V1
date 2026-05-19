package com.aria.migration.repository;

import com.aria.migration.model.MigrationPlaybook;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface MigrationPlaybookRepository extends JpaRepository<MigrationPlaybook, UUID> {
    Optional<MigrationPlaybook> findByName(String name);
}
