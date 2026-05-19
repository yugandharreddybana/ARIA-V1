package com.aria.migration.model;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/** V27.9 §17 — signed Zero-Downtime Migration Playbook. */
@Entity
@Table(name = "migration_playbooks")
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class MigrationPlaybook {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true)
    private String name;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String yaml;

    @Column(name = "signed_hash", nullable = false, length = 64)
    private String signedHash;

    @Column(name = "signed_by", nullable = false)
    private String signedBy;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;
}
