-- Migration: 000004_create_roles_permissions (DOWN)
-- Purpose: Remove RBAC tables and seed data (CASCADE handles role_permissions / user_roles rows)

DROP INDEX IF EXISTS idx_user_roles_role_id;
DROP INDEX IF EXISTS idx_user_roles_user_id;
DROP INDEX IF EXISTS idx_roles_org_id;

DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
