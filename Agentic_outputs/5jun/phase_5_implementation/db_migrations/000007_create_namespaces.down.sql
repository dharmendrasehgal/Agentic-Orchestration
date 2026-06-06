-- Migration: 000007_create_namespaces (DOWN)
-- Purpose: Remove namespaces table

DROP INDEX IF EXISTS idx_namespaces_cluster_id;
DROP INDEX IF EXISTS idx_namespaces_org_id;
DROP TABLE IF EXISTS namespaces;
