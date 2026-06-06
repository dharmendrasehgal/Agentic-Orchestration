-- Migration: 000002_create_organizations (DOWN)
-- Purpose: Remove organizations table

DROP INDEX  IF EXISTS idx_organizations_deleted_at;
DROP TABLE  IF EXISTS organizations;
