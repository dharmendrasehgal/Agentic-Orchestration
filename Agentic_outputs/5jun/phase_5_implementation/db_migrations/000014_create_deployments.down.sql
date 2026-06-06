-- Migration: 000014_create_deployments (DOWN)
-- Purpose: Remove deployments table and its ENUMs

DROP INDEX IF EXISTS idx_deployments_in_progress;
DROP INDEX IF EXISTS idx_deployments_creator;
DROP INDEX IF EXISTS idx_deployments_status;
DROP INDEX IF EXISTS idx_deployments_namespace_id;
DROP TABLE IF EXISTS deployments;
DROP TYPE  IF EXISTS deployment_status;
DROP TYPE  IF EXISTS deployment_strategy;
