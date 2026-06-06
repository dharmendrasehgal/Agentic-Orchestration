-- Migration: 000001_create_extensions (DOWN)
-- Purpose: Remove DCMS extensions (only if no other objects depend on them)

DROP EXTENSION IF EXISTS "pg_trgm";
DROP EXTENSION IF EXISTS "pgcrypto";
DROP EXTENSION IF EXISTS "uuid-ossp";
