package com.aria.fleet.repository;

import com.aria.fleet.model.AgentHeartbeat;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public interface AgentHeartbeatRepository extends JpaRepository<AgentHeartbeat, UUID> {

    /** Most recent heartbeat per agent within the lookback window. */
    @Query(value =
        "SELECT DISTINCT ON (agent_id) * " +
        "FROM agent_heartbeats " +
        "WHERE observed_at >= :since " +
        "ORDER BY agent_id, observed_at DESC",
        nativeQuery = true)
    List<AgentHeartbeat> latestPerAgentSince(@Param("since") Instant since);
}
