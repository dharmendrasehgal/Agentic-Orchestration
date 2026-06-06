-- Migration: 000010_create_networks_volumes (DOWN)
-- Purpose: Remove networks and volumes tables and network_driver enum

DROP INDEX IF EXISTS idx_volumes_driver;
DROP INDEX IF EXISTS idx_volumes_namespace_id;
DROP TABLE IF EXISTS volumes;

DROP INDEX IF EXISTS idx_networks_driver;
DROP INDEX IF EXISTS idx_networks_namespace_id;
DROP TABLE IF EXISTS networks;

DROP TYPE IF EXISTS network_driver;
