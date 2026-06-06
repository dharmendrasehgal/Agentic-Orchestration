-- Migration: 000001_create_extensions (UP)
-- Purpose: Enable required PostgreSQL extensions for DCMS
-- Tool: golang-migrate | DB: PostgreSQL 16

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
