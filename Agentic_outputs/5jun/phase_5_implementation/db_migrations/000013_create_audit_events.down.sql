-- Migration: 000013_create_audit_events (DOWN)
-- Purpose: Remove audit_events partitioned table and all child partitions.
--          Dropping the parent cascades to all partition children.

DROP INDEX IF EXISTS idx_audit_events_recent;
DROP INDEX IF EXISTS idx_audit_events_action;
DROP INDEX IF EXISTS idx_audit_events_resource;
DROP INDEX IF EXISTS idx_audit_events_actor_id;
DROP INDEX IF EXISTS idx_audit_events_org_id;

-- Drop child partitions explicitly first (required before parent drop in some PG versions)
DROP TABLE IF EXISTS audit_events_2026_09;
DROP TABLE IF EXISTS audit_events_2026_08;
DROP TABLE IF EXISTS audit_events_2026_07;

-- Drop the parent (also drops any remaining partitions via CASCADE)
DROP TABLE IF EXISTS audit_events;
