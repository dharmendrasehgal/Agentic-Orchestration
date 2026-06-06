-- Migration: 000010_create_networks_volumes (UP)
-- Purpose: Docker network and volume resources scoped to namespaces

CREATE TYPE network_driver AS ENUM ('bridge', 'overlay', 'macvlan', 'host', 'none', 'custom');

-- -------------------------------------------------------------------------
-- networks
-- -------------------------------------------------------------------------

CREATE TABLE networks (
    id            UUID           NOT NULL DEFAULT uuid_generate_v4(),
    namespace_id  UUID           NOT NULL,
    docker_id     VARCHAR(64)    NOT NULL,   -- Docker network ID
    name          VARCHAR(255)   NOT NULL,
    driver        network_driver NOT NULL DEFAULT 'bridge',
    subnet        CIDR,                      -- e.g. 172.18.0.0/16
    gateway       INET,                      -- e.g. 172.18.0.1
    internal      BOOLEAN        NOT NULL DEFAULT FALSE,
    ipv6_enabled  BOOLEAN        NOT NULL DEFAULT FALSE,
    labels        JSONB          NOT NULL DEFAULT '{}',
    options       JSONB          NOT NULL DEFAULT '{}',  -- driver-specific options
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT networks_pkey             PRIMARY KEY (id),
    CONSTRAINT networks_docker_id_unique UNIQUE (namespace_id, docker_id),
    CONSTRAINT networks_ns_fk            FOREIGN KEY (namespace_id) REFERENCES namespaces (id) ON DELETE CASCADE
);

CREATE INDEX idx_networks_namespace_id ON networks (namespace_id);
CREATE INDEX idx_networks_driver       ON networks (driver);

-- -------------------------------------------------------------------------
-- volumes
-- -------------------------------------------------------------------------

CREATE TABLE volumes (
    id            UUID         NOT NULL DEFAULT uuid_generate_v4(),
    namespace_id  UUID         NOT NULL,
    docker_name   VARCHAR(255) NOT NULL,    -- Docker volume name (unique within host scope)
    driver        VARCHAR(100) NOT NULL DEFAULT 'local',
    mount_point   TEXT,                     -- Host-side mount path (e.g. /var/lib/docker/volumes/...)
    labels        JSONB        NOT NULL DEFAULT '{}',
    options       JSONB        NOT NULL DEFAULT '{}',
    size_bytes    BIGINT,                   -- Populated by df-style probe; may be NULL
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT volumes_pkey             PRIMARY KEY (id),
    CONSTRAINT volumes_ns_name_unique   UNIQUE (namespace_id, docker_name),
    CONSTRAINT volumes_ns_fk            FOREIGN KEY (namespace_id) REFERENCES namespaces (id) ON DELETE CASCADE
);

CREATE INDEX idx_volumes_namespace_id ON volumes (namespace_id);
CREATE INDEX idx_volumes_driver       ON volumes (driver);

COMMENT ON TABLE  networks             IS 'Docker network resources attached to a namespace.';
COMMENT ON COLUMN networks.docker_id   IS 'Full Docker-assigned network ID.';
COMMENT ON COLUMN networks.internal    IS 'When true, external connectivity is disabled (Docker --internal flag).';
COMMENT ON TABLE  volumes              IS 'Docker named volumes scoped to a namespace; mount_point reflects the host-side path.';
COMMENT ON COLUMN volumes.size_bytes   IS 'Best-effort size reported by the storage driver; may be NULL if unavailable.';
