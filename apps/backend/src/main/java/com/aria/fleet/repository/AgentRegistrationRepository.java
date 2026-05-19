package com.aria.fleet.repository;

import com.aria.fleet.model.AgentRegistration;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AgentRegistrationRepository extends JpaRepository<AgentRegistration, String> {}
