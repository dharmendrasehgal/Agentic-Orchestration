-- Migration: 000008_create_containers (UP)
-- Purpose: CQRS read-model snapshot of Docker container state.
--          Source of truth is the Docker daemon; this table is a denormalised
--          projection kept in sync by the event-driven sync worker.

CREATE TYPE container_status AS ENUM ('created', 'running', 'paused', 'stopped', 'dead', 'removing');

CREATE TABLE containers (
    id             UUID             NOT NULL DEFAULT uuid_generate_v4(),
    namespace_id   UUID             NOT NULL,
    host_id        UUID             NOT NULL,
    docker_id      VARCHAR(64)      NOT NULL,   -- Docker 64-char short container ID
    name           VARCHAR(255)     NOT NULL,
    image          TEXT             NOT NULL,   -- full image reference (repo:tag or repo@digest)
    status         container_status NOT NULL DEFAULT 'created',
    ports          JSONB            NOT NULL DEFAULT '[]',   -- [{"host_port":8080,"container_port":80,"protocol":"tcp"}]
    env_count      INTEGER          NOT NULL DEFAULT 0,      -- count only; values are never stored
    labels         JSONB            NOT NULL DEFAULT '{}',
    cpu_limit      BIGINT,                       -- Docker CPU quota in nanoseconds
    memory_limit   BIGINT,                       -- Docker memory limit in bytes
    restart_count  INTEGER          NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
    started_at     TIMESTAMPTZ,
    finished_at    TIMESTAMPTZ,

    CONSTRAINT containers_pkey              PRIMARY KEY (id),
    CONSTRAINT containers_docker_id_unique  UNIQUE (host_id, docker_id),
    CONSTRAINT containers_namespace_fk      FOREIGN KEY (namespace_id) REFERENCES namespaces (id) ON DELETE CASCADE,
    CONSTRAINT containers_host_fk           FOREIGN KEY (host_id)      REFERENCES hosts (id)      ON DELETE CASCADE
);

-- Full index for namespace-scoped container listing (most common query pattern)
CREATE INDEX idx_containers_namespace_id ON containers (namespace_id);
CREATE INDEX idx_containers_host_id      ON containers (host_id);

-- Partial index: running containers are queried far more frequently than stopped ones
CREATE INDEX idx_containers_running ON containers (namespace_id, updated_at DESC)
    WHERE status = 'running';

-- GIN index supports JSONB path queries on port mappings and labels
CREATE INDEX idx_containers_ports_gin  ON containers USING GIN (ports);
CREATE INDEX idx_containers_labels_gin ON containers USING GIN (labels);

-- Trigram index for container name search
CREATE INDEX idx_containers_name_trgm ON containers USING GIN (name gin_trgm_ops);

COMMENT ON TABLE  containers           IS 'CQRS read-model: denormalised snapshot of Docker container state, refreshed by the sync worker.';
COMMENT ON COLUMN containers.docker_id IS 'Full 64-character Docker container ID (not the short 12-char alias).';
COMMENT ON COLUMN containers.env_count IS 'Number of environment variables; individual values are intentionally excluded to prevent secret leakage.';
COMMENT ON COLUMN containers.ports     IS 'JSON array of port binding objects; schema: [{host_ip, host_port, container_port, protocol}].';
