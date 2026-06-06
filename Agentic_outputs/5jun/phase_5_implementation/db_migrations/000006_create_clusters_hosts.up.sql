-- Migration: 000006_create_clusters_hosts (UP)
-- Purpose: Infrastructure layer — Docker Swarm / Kubernetes clusters and their member hosts

CREATE TYPE cluster_type   AS ENUM ('swarm', 'kubernetes');
CREATE TYPE cluster_status AS ENUM ('provisioning', 'active', 'degraded', 'unreachable', 'decommissioned');
CREATE TYPE host_status    AS ENUM ('online', 'offline', 'draining', 'maintenance');

-- -------------------------------------------------------------------------
-- clusters
-- -------------------------------------------------------------------------

CREATE TABLE clusters (
    id            UUID           NOT NULL DEFAULT uuid_generate_v4(),
    org_id        UUID           NOT NULL,
    name          VARCHAR(255)   NOT NULL,
    type          cluster_type   NOT NULL,
    status        cluster_status NOT NULL DEFAULT 'provisioning',
    swarm_id      VARCHAR(128),               -- Docker Swarm ID (NULL for k8s)
    manager_addr  VARCHAR(512),               -- Primary manager / API server endpoint
    tls_ca_cert   TEXT,                       -- PEM-encoded CA certificate for mTLS
    created_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT clusters_pkey           PRIMARY KEY (id),
    CONSTRAINT clusters_org_name_uniq  UNIQUE (org_id, name),
    CONSTRAINT clusters_org_fk         FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE RESTRICT
);

CREATE INDEX idx_clusters_org_id ON clusters (org_id);
CREATE INDEX idx_clusters_status ON clusters (status);

-- -------------------------------------------------------------------------
-- hosts
-- -------------------------------------------------------------------------

CREATE TABLE hosts (
    id                UUID         NOT NULL DEFAULT uuid_generate_v4(),
    cluster_id        UUID         NOT NULL,
    hostname          VARCHAR(255) NOT NULL,
    ip_address        INET         NOT NULL,
    docker_version    VARCHAR(50),
    agent_version     VARCHAR(50),
    status            host_status  NOT NULL DEFAULT 'offline',
    last_heartbeat_at TIMESTAMPTZ,
    capacity          JSONB        NOT NULL DEFAULT '{}',  -- {"cpu_cores":8,"memory_bytes":17179869184,"disk_bytes":...}
    labels            JSONB        NOT NULL DEFAULT '{}',  -- arbitrary Docker node labels
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT hosts_pkey            PRIMARY KEY (id),
    CONSTRAINT hosts_cluster_host_uniq UNIQUE (cluster_id, hostname),
    CONSTRAINT hosts_cluster_fk      FOREIGN KEY (cluster_id) REFERENCES clusters (id) ON DELETE CASCADE
);

CREATE INDEX idx_hosts_cluster_id        ON hosts (cluster_id);
CREATE INDEX idx_hosts_status            ON hosts (status);
CREATE INDEX idx_hosts_last_heartbeat_at ON hosts (last_heartbeat_at);

COMMENT ON TABLE  clusters             IS 'Docker Swarm or Kubernetes cluster registered with DCMS.';
COMMENT ON COLUMN clusters.swarm_id    IS 'Docker Engine swarm ID; NULL for Kubernetes clusters.';
COMMENT ON COLUMN clusters.manager_addr IS 'Primary control-plane endpoint (e.g., tcp://10.0.0.1:2376 or https://k8s-api:6443).';
COMMENT ON TABLE  hosts                IS 'Individual Docker host / k8s node that belongs to a cluster.';
COMMENT ON COLUMN hosts.capacity       IS 'Raw resource capacity reported by the DCMS agent at registration time.';
COMMENT ON COLUMN hosts.last_heartbeat_at IS 'Updated by the DCMS agent on every heartbeat; used for liveness detection.';
