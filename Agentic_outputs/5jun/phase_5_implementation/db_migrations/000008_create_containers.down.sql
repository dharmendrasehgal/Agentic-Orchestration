-- Migration: 000008_create_containers (DOWN)
-- Purpose: Remove containers table and container_status enum

DROP INDEX IF EXISTS idx_containers_name_trgm;
DROP INDEX IF EXISTS idx_containers_labels_gin;
DROP INDEX IF EXISTS idx_containers_ports_gin;
DROP INDEX IF EXISTS idx_containers_running;
DROP INDEX IF EXISTS idx_containers_host_id;
DROP INDEX IF EXISTS idx_containers_namespace_id;
DROP TABLE IF EXISTS containers;
DROP TYPE  IF EXISTS container_status;
