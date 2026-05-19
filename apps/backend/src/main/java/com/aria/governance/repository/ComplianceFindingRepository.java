package com.aria.governance.repository;

import com.aria.governance.model.ComplianceFinding;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ComplianceFindingRepository extends JpaRepository<ComplianceFinding, UUID> {
    List<ComplianceFinding> findByStatus(String status);
    List<ComplianceFinding> findTop50ByOrderByCreatedAtDesc();
}
