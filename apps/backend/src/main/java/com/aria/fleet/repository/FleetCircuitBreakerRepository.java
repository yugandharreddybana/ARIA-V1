package com.aria.fleet.repository;

import com.aria.fleet.model.FleetCircuitBreaker;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface FleetCircuitBreakerRepository extends JpaRepository<FleetCircuitBreaker, UUID> {
    List<FleetCircuitBreaker> findByClearedAtIsNull();
}
