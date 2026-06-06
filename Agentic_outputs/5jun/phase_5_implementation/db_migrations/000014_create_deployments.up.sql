-- Migration: 000014_create_deployments (UP)
-- Purpose: Deployment records — desired state declarations that drive
--          the reconciliation loop for rolling / blue-green updates

CREATE TYPE deployment_strategy AS ENUM ('rolling', 'blue_green', 'canary', 'recreate');
CREATE TYPE deployment_status   AS ENUM ('pending', 'in_progress', 'succeeded', 'failed', 'rolled_back', 'paused');

CREATE TABLE deployments (
    id                UUID                NOT NULL DEFAULT uuid_generate_v4(),
    namespace_id      UUID                NOT NULL,
    name              VARCHAR(255)        NOT NULL,
    image             TEXT                NOT NULL,         -- full image reference including tag/digest
    desired_replicas  INTEGER             NOT NULL DEFAULT 1,
    actual_replicas   INTEGER             NOT NULL DEFAULT 0,
    strategy          deployment_strategy NOT NULL DEFAULT 'rolling',
    status            deployment_status   NOT NULL DEFAULT 'pending',
    -- rolling update configuration
    max_surge         INTEGER             NOT NULL DEFAULT 1,       -- extra replicas allowed during rollout
    max_unavailable   INTEGER             NOT NULL DEFAULT 0,       -- replicas allowed to be unavailable
    -- health check
    health_check_path VARCHAR(512),
    health_check_port INTEGER,
    -- environment and config
    env_config        JSONB               NOT NULL DEFAULT '{}',    -- non-secret env key/value pairs
    resource_requests JSONB               NOT NULL DEFAULT '{}',    -- {"cpu_millicores":250,"memory_bytes":134217728}
    resource_limits   JSONB               NOT NULL DEFAULT '{}',
    labels            JSONB               NOT NULL DEFAULT '{}',
    annotations       JSONB               NOT NULL DEFAULT '{}',
    -- state tracking
    revision          INTEGER             NOT NULL DEFAULT 1,       -- increments on each re-deployment
    created_by        UUID                NOT NULL,
    created_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ         NOT NULL DEFAULT NOW(),

    CONSTRAINT deployments_pkey             PRIMARY KEY (id),
    CONSTRAINT deployments_ns_name_uniq     UNIQUE (namespace_id, name),
    CONSTRAINT deployments_namespace_fk     FOREIGN KEY (namespace_id) REFERENCES namespaces (id) ON DELETE CASCADE,
    CONSTRAINT deployments_creator_fk       FOREIGN KEY (created_by)   REFERENCES users (id)      ON DELETE RESTRICT,
    CONSTRAINT deployments_replicas_pos     CHECK (desired_replicas >= 0),
    CONSTRAINT deployments_surge_pos        CHECK (max_surge >= 0),
    CONSTRAINT deployments_unavail_pos      CHECK (max_unavailable >= 0)
);

CREATE INDEX idx_deployments_namespace_id ON deployments (namespace_id);
CREATE INDEX idx_deployments_status       ON deployments (status);
CREATE INDEX idx_deployments_creator      ON deployments (created_by);
CREATE INDEX idx_deployments_in_progress  ON deployments (namespace_id, updated_at DESC)
    WHERE status = 'in_progress';

COMMENT ON TABLE  deployments                  IS 'Desired-state declaration for a replicated container workload; drives the DCMS reconciliation loop.';
COMMENT ON COLUMN deployments.revision         IS 'Monotonically increasing counter; each new rollout increments this value for audit traceability.';
COMMENT ON COLUMN deployments.env_config       IS 'Non-sensitive environment variables; secrets must be injected via a secret-manager reference, not stored here.';
COMMENT ON COLUMN deployments.resource_requests IS 'Minimum guaranteed resources per replica; scheduler uses this for placement decisions.';
