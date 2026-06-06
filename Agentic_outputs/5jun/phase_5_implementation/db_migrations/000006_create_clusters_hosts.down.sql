-- Migration: 000006_create_clusters_hosts (DOWN)
-- Purpose: Remove clusters and hosts tables along with their custom ENUMs

DROP INDEX IF EXISTS idx_hosts_last_heartbeat_at;
DROP INDEX IF EXISTS idx_hosts_status;
DROP INDEX IF EXISTS idx_hosts_cluster_id;
DROP TABLE IF EXISTS hosts;

DROP INDEX IF EXISTS idx_clusters_status;
DROP INDEX IF EXISTS idx_clusters_org_id;
DROP TABLE IF EXISTS clusters;

DROP TYPE IF EXISTS host_status;
DROP TYPE IF EXISTS cluster_status;
DROP TYPE IF EXISTS cluster_type;
