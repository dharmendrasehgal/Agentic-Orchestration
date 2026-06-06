-- Migration: 000003_create_users (UP)
-- Purpose: Create users table with MFA support and soft-delete

CREATE TYPE user_status AS ENUM ('active', 'inactive', 'suspended', 'pending_verification');

CREATE TABLE users (
    id                UUID         NOT NULL DEFAULT uuid_generate_v4(),
    org_id            UUID         NOT NULL,
    email             VARCHAR(320) NOT NULL,
    password_hash     VARCHAR(255) NOT NULL,
    full_name         VARCHAR(255) NOT NULL,
    avatar_url        TEXT,
    mfa_enabled       BOOLEAN      NOT NULL DEFAULT FALSE,
    -- mfa_secret is stored encrypted using pgcrypto; application supplies the symmetric key
    mfa_secret        BYTEA,
    last_login_at     TIMESTAMPTZ,
    status            user_status  NOT NULL DEFAULT 'pending_verification',
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at        TIMESTAMPTZ,

    CONSTRAINT users_pkey            PRIMARY KEY (id),
    CONSTRAINT users_email_unique    UNIQUE (email),
    CONSTRAINT users_org_id_fk       FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
);

-- Covering index for login path (email lookup is the hot path)
CREATE INDEX idx_users_email      ON users (email)  WHERE deleted_at IS NULL;
-- Used by org-scoped member list queries
CREATE INDEX idx_users_org_id     ON users (org_id) WHERE deleted_at IS NULL;
-- Allows efficient filtering of users by status within an org
CREATE INDEX idx_users_org_status ON users (org_id, status) WHERE deleted_at IS NULL;
-- Soft-delete sentinel
CREATE INDEX idx_users_deleted_at ON users (deleted_at) WHERE deleted_at IS NULL;

COMMENT ON TABLE  users               IS 'Authenticated human actors; org_id provides multi-tenant isolation.';
COMMENT ON COLUMN users.mfa_secret    IS 'TOTP seed encrypted with pgcrypto pgp_sym_encrypt; never stored in plaintext.';
COMMENT ON COLUMN users.status        IS 'Lifecycle state: pending_verification -> active -> (inactive | suspended).';
