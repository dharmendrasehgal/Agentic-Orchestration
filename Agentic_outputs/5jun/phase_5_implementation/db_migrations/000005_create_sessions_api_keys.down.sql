-- Migration: 000005_create_sessions_api_keys (DOWN)
-- Purpose: Remove sessions and api_keys tables

DROP INDEX IF EXISTS idx_api_keys_active;
DROP INDEX IF EXISTS idx_api_keys_key_hash;
DROP INDEX IF EXISTS idx_api_keys_org_id;
DROP INDEX IF EXISTS idx_api_keys_user_id;
DROP TABLE IF EXISTS api_keys;

DROP INDEX IF EXISTS idx_sessions_token_hash;
DROP INDEX IF EXISTS idx_sessions_expires_at;
DROP INDEX IF EXISTS idx_sessions_user_id;
DROP TABLE IF EXISTS sessions;
