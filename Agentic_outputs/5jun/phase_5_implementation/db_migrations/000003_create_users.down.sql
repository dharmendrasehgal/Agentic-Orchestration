-- Migration: 000003_create_users (DOWN)
-- Purpose: Remove users table and user_status enum

DROP INDEX IF EXISTS idx_users_deleted_at;
DROP INDEX IF EXISTS idx_users_org_status;
DROP INDEX IF EXISTS idx_users_org_id;
DROP INDEX IF EXISTS idx_users_email;
DROP TABLE IF EXISTS users;
DROP TYPE  IF EXISTS user_status;
