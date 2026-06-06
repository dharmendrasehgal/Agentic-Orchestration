-- Migration: 000013_create_audit_events (UP)
-- Purpose: Immutable audit log, partitioned by month for data lifecycle management.
--          Tamper-evidence is provided by an HMAC stored alongside each row.

-- -------------------------------------------------------------------------
-- Partitioned parent table
-- -------------------------------------------------------------------------

CREATE TABLE audit_events (
    id             UUID         NOT NULL DEFAULT uuid_generate_v4(),
    org_id         UUID         NOT NULL,
    actor_id       UUID,                       -- NULL for system-generated events
    action         VARCHAR(100) NOT NULL,      -- e.g. container.start, user.login, cluster.delete
    resource_type  VARCHAR(100) NOT NULL,      -- e.g. container, cluster, user
    resource_id    UUID,
    ip_address     INET,
    user_agent     TEXT,
    details        JSONB        NOT NULL DEFAULT '{}',
    integrity_hmac VARCHAR(255) NOT NULL,      -- HMAC-SHA256(id||org_id||actor_id||action||occurred_at, secret_key)
    occurred_at    TIMESTAMPTZ  NOT NULL,

    CONSTRAINT audit_events_pkey PRIMARY KEY (id, occurred_at)
) PARTITION BY RANGE (occurred_at);

-- -------------------------------------------------------------------------
-- Monthly partitions: 2026-07, 2026-08, 2026-09
-- -------------------------------------------------------------------------

CREATE TABLE audit_events_2026_07
    PARTITION OF audit_events
    FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');

CREATE TABLE audit_events_2026_08
    PARTITION OF audit_events
    FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');

CREATE TABLE audit_events_2026_09
    PARTITION OF audit_events
    FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

-- -------------------------------------------------------------------------
-- Indexes (created on parent; PostgreSQL 11+ propagates to partitions)
-- -------------------------------------------------------------------------

CREATE INDEX idx_audit_events_org_id       ON audit_events (org_id, occurred_at DESC);
CREATE INDEX idx_audit_events_actor_id     ON audit_events (actor_id, occurred_at DESC)
    WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_events_resource     ON audit_events (resource_type, resource_id, occurred_at DESC)
    WHERE resource_id IS NOT NULL;
CREATE INDEX idx_audit_events_action       ON audit_events (action, occurred_at DESC);

-- Partial index for efficient "last 30 days" queries (hot operational path)
CREATE INDEX idx_audit_events_recent ON audit_events (org_id, occurred_at DESC)
    WHERE occurred_at >= (NOW() - INTERVAL '30 days');

COMMENT ON TABLE  audit_events                IS 'Append-only, partitioned audit log; rows must never be updated or deleted.';
COMMENT ON COLUMN audit_events.integrity_hmac IS 'HMAC-SHA256 over (id, org_id, actor_id, action, occurred_at) using a server-side secret; used to detect tampering.';
COMMENT ON COLUMN audit_events.actor_id       IS 'User or API-key principal; NULL for background system actions.';
COMMENT ON COLUMN audit_events.occurred_at    IS 'Partition key — always supply explicitly; do NOT rely on DEFAULT NOW() at the application layer.';
