-- Migration: 000005_create_sessions_api_keys (UP)
-- Purpose: Short-lived browser sessions and long-lived API keys

-- -------------------------------------------------------------------------
-- sessions
-- -------------------------------------------------------------------------

CREATE TABLE sessions (
    id                   UUID         NOT NULL DEFAULT uuid_generate_v4(),
    user_id              UUID         NOT NULL,
    token_hash           VARCHAR(255) NOT NULL,          -- SHA-256 hex of the bearer token
    refresh_token_hash   VARCHAR(255),                   -- SHA-256 hex of the refresh token
    expires_at           TIMESTAMPTZ  NOT NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    last_used_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    ip_address           INET,
    user_agent           TEXT,

    CONSTRAINT sessions_pkey         PRIMARY KEY (id),
    CONSTRAINT sessions_token_unique UNIQUE (token_hash),
    CONSTRAINT sessions_user_fk      FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_sessions_user_id      ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at   ON sessions (expires_at);   -- for GC sweep
CREATE INDEX idx_sessions_token_hash   ON sessions (token_hash);   -- token lookup hot path

-- -------------------------------------------------------------------------
-- api_keys
-- -------------------------------------------------------------------------

CREATE TABLE api_keys (
    id           UUID         NOT NULL DEFAULT uuid_generate_v4(),
    user_id      UUID         NOT NULL,
    org_id       UUID         NOT NULL,
    name         VARCHAR(255) NOT NULL,
    key_hash     VARCHAR(255) NOT NULL,                  -- SHA-256 hex of the raw API key
    scopes       TEXT[]       NOT NULL DEFAULT '{}',     -- e.g. {"containers:read","images:write"}
    expires_at   TIMESTAMPTZ,                            -- NULL = never expires
    last_used_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    revoked_at   TIMESTAMPTZ,

    CONSTRAINT api_keys_pkey          PRIMARY KEY (id),
    CONSTRAINT api_keys_key_unique    UNIQUE (key_hash),
    CONSTRAINT api_keys_user_fk       FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT api_keys_org_fk        FOREIGN KEY (org_id)  REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE INDEX idx_api_keys_user_id    ON api_keys (user_id);
CREATE INDEX idx_api_keys_org_id     ON api_keys (org_id);
CREATE INDEX idx_api_keys_key_hash   ON api_keys (key_hash);
CREATE INDEX idx_api_keys_active     ON api_keys (user_id)
    WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW());

COMMENT ON TABLE  sessions                IS 'Short-lived authenticated sessions; token_hash prevents plaintext token storage.';
COMMENT ON COLUMN sessions.token_hash     IS 'SHA-256 hex digest of the opaque bearer token issued to the client.';
COMMENT ON TABLE  api_keys                IS 'Long-lived programmatic access credentials; scopes enforce least-privilege.';
COMMENT ON COLUMN api_keys.key_hash       IS 'SHA-256 hex digest; raw key is shown once at creation and never stored.';
COMMENT ON COLUMN api_keys.scopes         IS 'Array of permission strings in the form resource:action.';
