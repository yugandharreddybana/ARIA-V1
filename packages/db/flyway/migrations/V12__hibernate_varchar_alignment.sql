-- Hibernate ddl-auto=validate maps @Column(length=n) to varchar(n).
-- Earlier migrations used CHAR(n) for hashes, which Postgres reports as bpchar.

ALTER TABLE agent_registry
  ALTER COLUMN fingerprint TYPE VARCHAR(64);

ALTER TABLE distillation_runs
  ALTER COLUMN task_description_hash TYPE VARCHAR(64);

ALTER TABLE fim_alerts
  ALTER COLUMN expected_hash TYPE VARCHAR(64),
  ALTER COLUMN observed_hash TYPE VARCHAR(64);

ALTER TABLE fim_registry
  ALTER COLUMN hash TYPE VARCHAR(64);

ALTER TABLE migration_playbooks
  ALTER COLUMN signed_hash TYPE VARCHAR(64);

ALTER TABLE semantic_chunks
  ALTER COLUMN version_hash TYPE VARCHAR(64);

ALTER TABLE shadow_learning_runs
  ALTER COLUMN commit_sha TYPE VARCHAR(40);

ALTER TABLE skill_experience_profiles
  ALTER COLUMN yaml_hash TYPE VARCHAR(64);
