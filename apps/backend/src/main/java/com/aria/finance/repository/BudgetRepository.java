package com.aria.finance.repository;

import com.aria.finance.model.Budget;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface BudgetRepository extends JpaRepository<Budget, UUID> {
    Optional<Budget> findByScopeAndScopeRef(String scope, UUID scopeRef);
}
