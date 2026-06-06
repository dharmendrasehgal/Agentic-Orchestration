-- Migration: 000007_create_namespaces (UP)
-- Purpose: Logical grouping layer (analogous to k8s namespaces) that scopes
--          containers, networks, volumes and alerts within a cluster

CREATE TABLE namespaces (
    id               UUID         NOT NULL DEFAULT uuid_generate_v4(),
    org_id           UUID         NOT NULL,
    cluster_id       UUID         NOT NULL,
    name             VARCHAR(255) NOT NULL,
    labels           JSONB        NOT NULL DEFAULT '{}',
    resource_limits  JSONB        NOT NULL DEFAULT '{}',  -- {"cpu_millicores":4000,"memory_bytes":8589934592}
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT namespaces_pkey               PRIMARY KEY (id),
    CONSTRAINT namespaces_cluster_name_uniq  UNIQUE (cluster_id, name),
    CONSTRAINT namespaces_org_fk             FOREIGN KEY (org_id)     REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT namespaces_cluster_fk         FOREIGN KEY (cluster_id) REFERENCES clusters (id)      ON DELETE CASCADE
);

CREATE INDEX idx_namespaces_org_id     ON namespaces (org_id);
CREATE INDEX idx_namespaces_cluster_id ON namespaces (cluster_id);

COMMENT ON TABLE  namespaces                IS 'Logical isolation boundary within a cluster; scopes all workload and network resources.';
COMMENT ON COLUMN namespaces.labels         IS 'Arbitrary metadata labels used for policy targeting and UI filtering.';
COMMENT ON COLUMN namespaces.resource_limits IS 'Soft resource quota applied to the sum of all containers in the namespace.';
