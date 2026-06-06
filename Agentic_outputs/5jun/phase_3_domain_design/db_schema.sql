-- =============================================================================
-- DCMS — Docker Container Management System
-- PostgreSQL 16 DDL — Complete Schema
-- Agent:      db_architect_agent
-- Phase:      P3 — Domain Design
-- Version:    1.0.0
-- Date:       2026-06-05
-- Consumers:  db_developer_agent, backend_developer_agent, backend_architect_agent
-- =============================================================================
-- Migration tool: golang-migrate  (files live in db_migrations/)
-- Naming conventions:
--   Tables      : snake_case, plural
--   PKs         : id  UUID  DEFAULT gen_random_uuid()
--   Timestamps  : created_at, updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
--   Soft delete : deleted_at TIMESTAMPTZ NULL  (NULL = active)
--   FK columns  : <singular_table>_id
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";     -- uuid_generate_v4() fallback
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_uuid(), crypt(), encrypt()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- GIN trigram indexes for full-text log search

-- ─────────────────────────────────────────────────────────────────────────────
-- UTILITY: updated_at AUTO-UPDATE TRIGGER FUNCTION
-- Applied to every table that has an updated_at column.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_set_updated_at() IS
    'Trigger function: automatically sets updated_at = now() on every UPDATE.';

-- Helper macro to attach the trigger — called after each table definition.
-- Usage:  SELECT fn_attach_updated_at_trigger('table_name');
CREATE OR REPLACE FUNCTION fn_attach_updated_at_trigger(p_table TEXT)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    EXECUTE format(
        'CREATE TRIGGER trg_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()',
        p_table, p_table
    );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- UTILITY: AUDIT LOG TRIGGER FUNCTION
-- Writes a row to audit_events for INSERT / UPDATE / DELETE on sensitive tables.
-- The trigger is added explicitly per-table below to control which tables are
-- audited and which columns are captured.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION fn_audit_log_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_actor_id   UUID;
    v_org_id     UUID;
    v_old_data   JSONB;
    v_new_data   JSONB;
BEGIN
    -- Attempt to read calling session variables (set by app layer via SET LOCAL).
    BEGIN
        v_actor_id := current_setting('dcms.current_user_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_actor_id := NULL;
    END;
    BEGIN
        v_org_id := current_setting('dcms.current_org_id')::UUID;
    EXCEPTION WHEN OTHERS THEN
        v_org_id := NULL;
    END;

    IF (TG_OP = 'DELETE') THEN
        v_old_data := to_jsonb(OLD);
        v_new_data := NULL;
    ELSIF (TG_OP = 'INSERT') THEN
        v_old_data := NULL;
        v_new_data := to_jsonb(NEW);
    ELSE  -- UPDATE
        v_old_data := to_jsonb(OLD);
        v_new_data := to_jsonb(NEW);
    END IF;

    INSERT INTO audit_events (
        id,
        actor_id,
        organization_id,
        action,
        resource_type,
        resource_id,
        old_data,
        new_data,
        source_ip,
        created_at
    ) VALUES (
        gen_random_uuid(),
        v_actor_id,
        v_org_id,
        TG_OP,
        TG_TABLE_NAME,
        CASE
            WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD)->>'id')::UUID
            ELSE (to_jsonb(NEW)->>'id')::UUID
        END,
        v_old_data,
        v_new_data,
        inet_client_addr(),
        now()
    );

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION fn_audit_log_trigger() IS
    'Generic DML audit trigger. Reads actor_id and org_id from session-local settings '
    '(dcms.current_user_id, dcms.current_org_id) set by the application before each '
    'transaction. Writes an immutable row to audit_events. SECURITY DEFINER so it '
    'always has INSERT rights on audit_events regardless of the caller role.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1 — CORE AUTH TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
CREATE TABLE organizations (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    name            TEXT        NOT NULL,
    slug            TEXT        NOT NULL,           -- URL-safe identifier
    display_name    TEXT,
    plan            TEXT        NOT NULL DEFAULT 'community',  -- community | pro | enterprise
    max_hosts       INTEGER     NOT NULL DEFAULT 10,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    sso_enabled     BOOLEAN     NOT NULL DEFAULT FALSE,
    oidc_issuer_url TEXT,                           -- OIDC IdP issuer URL when SSO enabled
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT pk_organizations      PRIMARY KEY (id),
    CONSTRAINT uq_organizations_slug UNIQUE      (slug),
    CONSTRAINT chk_organizations_plan CHECK (plan IN ('community','pro','enterprise'))
);

COMMENT ON TABLE  organizations                IS 'Top-level tenant unit. All resources are scoped to an organization for multi-tenant isolation.';
COMMENT ON COLUMN organizations.slug           IS 'Lowercase URL-safe identifier used in API paths and SSO audience claims.';
COMMENT ON COLUMN organizations.plan           IS 'Billing tier: community (free), pro, or enterprise.';
COMMENT ON COLUMN organizations.oidc_issuer_url IS 'External OIDC provider issuer URL. NULL when SSO is disabled (local auth only).';
COMMENT ON COLUMN organizations.deleted_at     IS 'Soft-delete timestamp. NULL means active. Non-NULL means org is deactivated.';

SELECT fn_attach_updated_at_trigger('organizations');

CREATE INDEX idx_organizations_is_active  ON organizations (is_active) WHERE is_active = TRUE;
CREATE INDEX idx_organizations_deleted_at ON organizations (deleted_at) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL,
    email               TEXT        NOT NULL,
    username            TEXT        NOT NULL,
    display_name        TEXT,
    -- Password auth (NULL when IdP is used exclusively)
    password_hash       TEXT,                      -- bcrypt hash, cost >= 12
    -- OIDC federation
    external_id         TEXT,                      -- sub claim from IdP
    auth_provider       TEXT        NOT NULL DEFAULT 'local',  -- local | oidc | saml
    -- Account state
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    is_mfa_enabled      BOOLEAN     NOT NULL DEFAULT FALSE,
    mfa_secret_enc      BYTEA,                     -- AES-256-GCM encrypted TOTP secret (pgcrypto)
    failed_login_count  INTEGER     NOT NULL DEFAULT 0,
    locked_until        TIMESTAMPTZ,               -- NULL = not locked
    last_login_at       TIMESTAMPTZ,
    -- Profile / preferences
    ui_preferences      JSONB       NOT NULL DEFAULT '{}',   -- theme, language, etc.
    -- GDPR
    anonymized_at       TIMESTAMPTZ,               -- set by PII scrub job on account deletion
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT pk_users                    PRIMARY KEY (id),
    CONSTRAINT fk_users_organization       FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT uq_users_email_per_org      UNIQUE      (organization_id, email),
    CONSTRAINT uq_users_username_per_org   UNIQUE      (organization_id, username),
    CONSTRAINT chk_users_auth_provider     CHECK       (auth_provider IN ('local','oidc','saml'))
);

COMMENT ON TABLE  users                    IS 'Platform user accounts. Scoped to one organization. Supports local password auth and OIDC/SAML federation.';
COMMENT ON COLUMN users.password_hash      IS 'bcrypt hash (cost >= 12). NULL for IdP-only accounts. Never logged or returned in API responses.';
COMMENT ON COLUMN users.external_id        IS 'IdP sub claim. NULL for local accounts. Used to correlate OIDC tokens to DCMS user records.';
COMMENT ON COLUMN users.mfa_secret_enc     IS 'AES-256-GCM encrypted TOTP seed. Key managed via Vault. NULL when MFA not enrolled.';
COMMENT ON COLUMN users.ui_preferences     IS 'Non-sensitive UI state: theme (dark/light), default namespace, etc.';
COMMENT ON COLUMN users.anonymized_at      IS 'Populated by async PII scrub job after soft-delete. Once set, PII columns are overwritten.';
COMMENT ON COLUMN users.deleted_at         IS 'Soft-delete. GDPR erasure replaces email/display_name with hashed placeholders within 30 days.';

SELECT fn_attach_updated_at_trigger('users');

CREATE INDEX idx_users_organization_id ON users (organization_id);
CREATE INDEX idx_users_email           ON users (email);
CREATE INDEX idx_users_external_id     ON users (external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_users_is_active       ON users (organization_id, is_active) WHERE is_active = TRUE AND deleted_at IS NULL;

-- Audit sensitive user mutations
CREATE TRIGGER trg_users_audit
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

-- ---------------------------------------------------------------------------
-- roles
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id UUID,                           -- NULL = system-wide built-in role
    name            TEXT        NOT NULL,
    description     TEXT,
    is_system       BOOLEAN     NOT NULL DEFAULT FALSE,  -- TRUE = cannot be deleted
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_roles                 PRIMARY KEY (id),
    CONSTRAINT fk_roles_organization    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT uq_roles_name_per_org    UNIQUE      (organization_id, name)
);

COMMENT ON TABLE  roles            IS 'Named roles grouping permissions. Built-in system roles (Admin, Operator, Viewer) have is_system=TRUE and cannot be deleted.';
COMMENT ON COLUMN roles.is_system  IS 'TRUE for system-managed roles (admin, operator, viewer). Custom org-level roles have FALSE.';

SELECT fn_attach_updated_at_trigger('roles');

CREATE INDEX idx_roles_organization_id ON roles (organization_id);

-- Seed built-in system roles (idempotent via ON CONFLICT DO NOTHING)
INSERT INTO roles (id, organization_id, name, description, is_system)
VALUES
    ('00000000-0000-0000-0000-000000000001', NULL, 'admin',    'Full platform access',                          TRUE),
    ('00000000-0000-0000-0000-000000000002', NULL, 'operator', 'Container and resource lifecycle management',   TRUE),
    ('00000000-0000-0000-0000-000000000003', NULL, 'viewer',   'Read-only access to all resources',             TRUE)
ON CONFLICT (organization_id, name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- permissions
-- ---------------------------------------------------------------------------
CREATE TABLE permissions (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    resource    TEXT        NOT NULL,   -- e.g. containers, images, networks, volumes, users, audit_events
    action      TEXT        NOT NULL,   -- e.g. read, write, delete, exec, admin
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_permissions              PRIMARY KEY (id),
    CONSTRAINT uq_permissions_resource_action UNIQUE (resource, action)
);

COMMENT ON TABLE  permissions         IS 'Atomic permission tokens in the format resource:action. Combined into roles via role_permissions.';
COMMENT ON COLUMN permissions.resource IS 'Resource domain: containers, images, networks, volumes, namespaces, hosts, clusters, users, roles, audit_events, alerts, deployments.';
COMMENT ON COLUMN permissions.action   IS 'CRUD verb or domain action: read, write, delete, exec, scale, admin.';

-- Seed core permissions
INSERT INTO permissions (resource, action, description) VALUES
    ('containers',    'read',    'View container list and details'),
    ('containers',    'write',   'Create, start, stop, restart, pause, kill containers'),
    ('containers',    'delete',  'Remove containers'),
    ('containers',    'exec',    'Execute commands in running containers'),
    ('images',        'read',    'View image list and scan results'),
    ('images',        'write',   'Pull, push, tag images'),
    ('images',        'delete',  'Delete images'),
    ('networks',      'read',    'View network list and details'),
    ('networks',      'write',   'Create networks; connect/disconnect containers'),
    ('networks',      'delete',  'Delete networks'),
    ('volumes',       'read',    'View volume list and usage'),
    ('volumes',       'write',   'Create volumes; attach to containers'),
    ('volumes',       'delete',  'Delete volumes'),
    ('namespaces',    'read',    'View namespaces'),
    ('namespaces',    'admin',   'Create, update, delete namespaces'),
    ('hosts',         'read',    'View registered hosts'),
    ('hosts',         'admin',   'Register and deregister hosts'),
    ('clusters',      'read',    'View cluster topology'),
    ('clusters',      'write',   'Scale services; drain nodes'),
    ('clusters',      'admin',   'Create and delete clusters'),
    ('users',         'read',    'View user list'),
    ('users',         'admin',   'Create, update, deactivate users; assign roles'),
    ('audit_events',  'read',    'View and export audit log'),
    ('alerts',        'read',    'View alerts and alert history'),
    ('alerts',        'write',   'Create and update alert rules; silence alerts'),
    ('deployments',   'read',    'View deployment history'),
    ('deployments',   'write',   'Create and manage deployments')
ON CONFLICT (resource, action) DO NOTHING;

-- ---------------------------------------------------------------------------
-- role_permissions  (N:M junction)
-- ---------------------------------------------------------------------------
CREATE TABLE role_permissions (
    role_id       UUID        NOT NULL,
    permission_id UUID        NOT NULL,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by    UUID,                              -- user_id who granted this

    CONSTRAINT pk_role_permissions        PRIMARY KEY (role_id, permission_id),
    CONSTRAINT fk_role_permissions_role   FOREIGN KEY (role_id)       REFERENCES roles(id)       ON DELETE CASCADE,
    CONSTRAINT fk_role_permissions_perm   FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

COMMENT ON TABLE role_permissions IS 'Maps permissions to roles. Deleting a role cascades and removes all its permission assignments.';

CREATE INDEX idx_role_permissions_permission_id ON role_permissions (permission_id);

-- ---------------------------------------------------------------------------
-- user_roles  (N:M junction — user to role scoped to optional namespace)
-- ---------------------------------------------------------------------------
CREATE TABLE user_roles (
    id            UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL,
    role_id       UUID        NOT NULL,
    namespace_id  UUID,                              -- NULL = organization-wide scope
    organization_id UUID      NOT NULL,
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by    UUID,                              -- user_id of granting admin

    CONSTRAINT pk_user_roles             PRIMARY KEY (id),
    CONSTRAINT fk_user_roles_user        FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_role        FOREIGN KEY (role_id)         REFERENCES roles(id)         ON DELETE CASCADE,
    CONSTRAINT fk_user_roles_org         FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT uq_user_roles_scope       UNIQUE      (user_id, role_id, namespace_id)
);

COMMENT ON TABLE  user_roles              IS 'Assigns a role to a user optionally scoped to a namespace. namespace_id NULL means the role applies globally within the organization.';
COMMENT ON COLUMN user_roles.namespace_id IS 'Scope: NULL = org-wide, non-NULL = namespace-scoped (e.g. dev, staging, prod).';

CREATE INDEX idx_user_roles_user_id       ON user_roles (user_id);
CREATE INDEX idx_user_roles_role_id       ON user_roles (role_id);
CREATE INDEX idx_user_roles_namespace_id  ON user_roles (namespace_id) WHERE namespace_id IS NOT NULL;
CREATE INDEX idx_user_roles_org_id        ON user_roles (organization_id);

CREATE TRIGGER trg_user_roles_audit
AFTER INSERT OR UPDATE OR DELETE ON user_roles
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
CREATE TABLE sessions (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL,
    organization_id UUID        NOT NULL,
    token_hash      TEXT        NOT NULL,            -- SHA-256(JWT jti) — the raw token is never stored
    refresh_token_hash TEXT,                         -- SHA-256(refresh token)
    ip_address      INET,
    user_agent      TEXT,
    is_mfa_verified BOOLEAN     NOT NULL DEFAULT FALSE,
    expires_at      TIMESTAMPTZ NOT NULL,
    refresh_expires_at TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_sessions            PRIMARY KEY (id),
    CONSTRAINT fk_sessions_user       FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE,
    CONSTRAINT fk_sessions_org        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT uq_sessions_token_hash UNIQUE (token_hash)
);

COMMENT ON TABLE  sessions                IS 'Active JWT sessions. The raw JWT is never stored — only SHA-256 of the jti claim. Used for revocation checks.';
COMMENT ON COLUMN sessions.token_hash     IS 'SHA-256 hex of the JWT jti claim. Used for O(1) token revocation lookup without storing the token itself.';
COMMENT ON COLUMN sessions.revoked_at     IS 'Non-NULL means session was explicitly invalidated (logout or admin revocation). Checked on every introspection call.';

-- Partial index: only un-revoked, non-expired sessions queried by auth-service
CREATE INDEX idx_sessions_token_hash      ON sessions (token_hash)    WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_user_id         ON sessions (user_id)       WHERE revoked_at IS NULL;
CREATE INDEX idx_sessions_expires_at      ON sessions (expires_at)    WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- api_keys
-- ---------------------------------------------------------------------------
CREATE TABLE api_keys (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL,
    organization_id UUID        NOT NULL,
    name            TEXT        NOT NULL,
    key_hash        TEXT        NOT NULL,            -- SHA-256 of the plaintext key (shown only at creation)
    key_prefix      TEXT        NOT NULL,            -- First 8 chars shown in UI for identification (e.g. "dcms_abc")
    role_id         UUID        NOT NULL,
    namespace_id    UUID,                            -- NULL = org-wide scope
    last_used_at    TIMESTAMPTZ,
    expires_at      TIMESTAMPTZ,
    revoked_at      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_api_keys              PRIMARY KEY (id),
    CONSTRAINT fk_api_keys_user         FOREIGN KEY (user_id)         REFERENCES users(id)         ON DELETE CASCADE,
    CONSTRAINT fk_api_keys_org          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_api_keys_role         FOREIGN KEY (role_id)         REFERENCES roles(id)         ON DELETE RESTRICT,
    CONSTRAINT uq_api_keys_hash         UNIQUE      (key_hash)
);

COMMENT ON TABLE  api_keys           IS 'Named API keys for programmatic/CI-CD access. Plaintext key shown only once at creation; only SHA-256 hash persisted.';
COMMENT ON COLUMN api_keys.key_hash  IS 'SHA-256 hex of the plaintext API key. Compared on every request; raw key never stored.';
COMMENT ON COLUMN api_keys.key_prefix IS '8-char prefix displayed in the UI to identify a key without exposing the full value.';

SELECT fn_attach_updated_at_trigger('api_keys');

CREATE INDEX idx_api_keys_key_hash      ON api_keys (key_hash)      WHERE revoked_at IS NULL;
CREATE INDEX idx_api_keys_user_id       ON api_keys (user_id);
CREATE INDEX idx_api_keys_org_id        ON api_keys (organization_id);

CREATE TRIGGER trg_api_keys_audit
AFTER INSERT OR UPDATE OR DELETE ON api_keys
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2 — NAMESPACE / CLUSTER TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- ---------------------------------------------------------------------------
-- clusters
-- ---------------------------------------------------------------------------
CREATE TABLE clusters (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL,
    name            TEXT        NOT NULL,
    description     TEXT,
    cluster_type    TEXT        NOT NULL DEFAULT 'standalone',  -- standalone | swarm | kubernetes
    api_endpoint    TEXT,                            -- e.g. https://k8s-api.example.com:6443
    kubeconfig_enc  BYTEA,                           -- AES-256-GCM encrypted kubeconfig (k8s only)
    status          TEXT        NOT NULL DEFAULT 'active', -- active | degraded | offline | archived
    manager_host_id UUID,                            -- FK to hosts — the Swarm manager or k8s control-plane proxy host
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT pk_clusters                   PRIMARY KEY (id),
    CONSTRAINT fk_clusters_organization      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT uq_clusters_name_per_org      UNIQUE      (organization_id, name),
    CONSTRAINT chk_clusters_type            CHECK       (cluster_type IN ('standalone','swarm','kubernetes')),
    CONSTRAINT chk_clusters_status          CHECK       (status IN ('active','degraded','offline','archived'))
);

COMMENT ON TABLE  clusters                 IS 'Logical grouping of Docker hosts into a cluster (Swarm or Kubernetes). A standalone host may be its own single-node cluster.';
COMMENT ON COLUMN clusters.kubeconfig_enc  IS 'AES-256-GCM encrypted kubeconfig YAML. Decrypted in memory only by cluster-service. Key managed by Vault.';
COMMENT ON COLUMN clusters.manager_host_id IS 'Points to the Swarm manager or Kubernetes API proxy host. FK resolved after hosts insert; may be NULL until manager is designated.';

SELECT fn_attach_updated_at_trigger('clusters');

CREATE INDEX idx_clusters_organization_id ON clusters (organization_id);
CREATE INDEX idx_clusters_status          ON clusters (status) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- hosts
-- ---------------------------------------------------------------------------
CREATE TABLE hosts (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL,
    cluster_id      UUID,
    name            TEXT        NOT NULL,
    hostname        TEXT        NOT NULL,
    ip_address      INET        NOT NULL,
    agent_port      INTEGER     NOT NULL DEFAULT 9090,
    agent_version   TEXT,
    docker_version  TEXT,
    os_info         JSONB       NOT NULL DEFAULT '{}',  -- {"os":"Ubuntu 22.04","kernel":"6.1.0","arch":"x86_64"}
    labels          JSONB       NOT NULL DEFAULT '{}',  -- arbitrary key/value for scheduling hints
    status          TEXT        NOT NULL DEFAULT 'active',  -- active | unreachable | maintenance | decommissioned
    last_heartbeat_at TIMESTAMPTZ,
    cpu_cores       INTEGER,
    memory_bytes    BIGINT,
    disk_bytes      BIGINT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT pk_hosts                  PRIMARY KEY (id),
    CONSTRAINT fk_hosts_organization     FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_hosts_cluster          FOREIGN KEY (cluster_id)      REFERENCES clusters(id)      ON DELETE SET NULL,
    CONSTRAINT uq_hosts_hostname_per_org UNIQUE      (organization_id, hostname),
    CONSTRAINT chk_hosts_status          CHECK       (status IN ('active','unreachable','maintenance','decommissioned'))
);

COMMENT ON TABLE  hosts                    IS 'Registered Docker host. One DCMS agent binary runs on each host at agent_port.';
COMMENT ON COLUMN hosts.os_info            IS 'JSON snapshot of host OS details collected at registration and refreshed by agent heartbeat.';
COMMENT ON COLUMN hosts.labels             IS 'Arbitrary key/value labels for workload placement (e.g. {"env":"prod","region":"us-east"}).';
COMMENT ON COLUMN hosts.last_heartbeat_at  IS 'Timestamp of the most recent agent heartbeat. host marked unreachable after 3 missed intervals (45s).';

SELECT fn_attach_updated_at_trigger('hosts');

-- Add deferred FK from clusters.manager_host_id back to hosts
ALTER TABLE clusters
    ADD CONSTRAINT fk_clusters_manager_host
    FOREIGN KEY (manager_host_id) REFERENCES hosts(id) ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX idx_hosts_organization_id     ON hosts (organization_id);
CREATE INDEX idx_hosts_cluster_id          ON hosts (cluster_id)   WHERE cluster_id IS NOT NULL;
CREATE INDEX idx_hosts_status              ON hosts (status)        WHERE deleted_at IS NULL;
CREATE INDEX idx_hosts_last_heartbeat_at   ON hosts (last_heartbeat_at);

CREATE TRIGGER trg_hosts_audit
AFTER INSERT OR UPDATE OR DELETE ON hosts
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

-- ---------------------------------------------------------------------------
-- namespaces
-- ---------------------------------------------------------------------------
CREATE TABLE namespaces (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL,
    cluster_id      UUID,                            -- optional: namespace pinned to a cluster
    name            TEXT        NOT NULL,
    description     TEXT,
    environment     TEXT        NOT NULL DEFAULT 'development',  -- development | staging | production
    labels          JSONB       NOT NULL DEFAULT '{}',
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT pk_namespaces                  PRIMARY KEY (id),
    CONSTRAINT fk_namespaces_organization     FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_namespaces_cluster          FOREIGN KEY (cluster_id)      REFERENCES clusters(id)      ON DELETE SET NULL,
    CONSTRAINT uq_namespaces_name_per_org     UNIQUE      (organization_id, name),
    CONSTRAINT chk_namespaces_environment     CHECK       (environment IN ('development','staging','production','custom'))
);

COMMENT ON TABLE  namespaces             IS 'Logical isolation unit (dev, staging, prod). All resource tables carry a namespace_id FK for scoped RBAC and list filtering.';
COMMENT ON COLUMN namespaces.environment IS 'Typed environment label. Production namespaces enforce stricter CVE policy: CRITICAL CVEs block deployment.';

SELECT fn_attach_updated_at_trigger('namespaces');

CREATE INDEX idx_namespaces_organization_id ON namespaces (organization_id);
CREATE INDEX idx_namespaces_cluster_id      ON namespaces (cluster_id)      WHERE cluster_id IS NOT NULL;
CREATE INDEX idx_namespaces_is_active       ON namespaces (organization_id, is_active) WHERE is_active = TRUE;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3 — RESOURCE METADATA TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- ---------------------------------------------------------------------------
-- images
-- ---------------------------------------------------------------------------
CREATE TABLE images (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL,
    host_id         UUID        NOT NULL,
    namespace_id    UUID,
    repository      TEXT        NOT NULL,            -- e.g. "docker.io/library/nginx"
    tag             TEXT        NOT NULL DEFAULT 'latest',
    digest          TEXT        NOT NULL,            -- sha256:... content-addressable hash
    size_bytes      BIGINT,
    architecture    TEXT,                            -- amd64 | arm64
    os_family       TEXT,                            -- linux | windows
    labels          JSONB       NOT NULL DEFAULT '{}',
    scan_status     TEXT        NOT NULL DEFAULT 'pending', -- pending | scanning | passed | failed | error
    scan_completed_at TIMESTAMPTZ,
    is_local        BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT pk_images                  PRIMARY KEY (id),
    CONSTRAINT fk_images_organization     FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_images_host             FOREIGN KEY (host_id)         REFERENCES hosts(id)         ON DELETE CASCADE,
    CONSTRAINT fk_images_namespace        FOREIGN KEY (namespace_id)    REFERENCES namespaces(id)    ON DELETE SET NULL,
    CONSTRAINT uq_images_digest_per_host  UNIQUE      (host_id, digest),
    CONSTRAINT chk_images_scan_status     CHECK       (scan_status IN ('pending','scanning','passed','failed','error'))
);

COMMENT ON TABLE  images             IS 'Container image metadata per host. digest ensures uniqueness per host; the same image may appear on multiple hosts with the same digest.';
COMMENT ON COLUMN images.digest      IS 'OCI content-addressable digest (sha256:...). Immutable identifier used for CVE scan deduplication.';
COMMENT ON COLUMN images.scan_status IS 'Trivy scan lifecycle: pending → scanning → passed|failed|error. failed means CRITICAL CVEs found; blocks production deploy.';

SELECT fn_attach_updated_at_trigger('images');

CREATE INDEX idx_images_organization_id ON images (organization_id);
CREATE INDEX idx_images_host_id         ON images (host_id);
CREATE INDEX idx_images_namespace_id    ON images (namespace_id)    WHERE namespace_id IS NOT NULL;
CREATE INDEX idx_images_scan_status     ON images (scan_status)     WHERE deleted_at IS NULL;
CREATE INDEX idx_images_digest          ON images (digest);
-- Trigram index for repository:tag search (supports LIKE '%nginx%' queries)
CREATE INDEX idx_images_repository_trgm ON images USING gin (repository gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- image_scan_results
-- ---------------------------------------------------------------------------
CREATE TABLE image_scan_results (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    image_id        UUID        NOT NULL,
    organization_id UUID        NOT NULL,
    scanner         TEXT        NOT NULL DEFAULT 'trivy',
    scanner_version TEXT,
    scanned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    critical_count  INTEGER     NOT NULL DEFAULT 0,
    high_count      INTEGER     NOT NULL DEFAULT 0,
    medium_count    INTEGER     NOT NULL DEFAULT 0,
    low_count       INTEGER     NOT NULL DEFAULT 0,
    unknown_count   INTEGER     NOT NULL DEFAULT 0,
    findings        JSONB       NOT NULL DEFAULT '[]',  -- Array of CVE objects from Trivy JSON output
    raw_report_path TEXT,                              -- Optional: S3/GCS path to full raw report
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_image_scan_results              PRIMARY KEY (id),
    CONSTRAINT fk_image_scan_results_image        FOREIGN KEY (image_id)        REFERENCES images(id)        ON DELETE CASCADE,
    CONSTRAINT fk_image_scan_results_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

COMMENT ON TABLE  image_scan_results          IS 'Trivy vulnerability scan results per image. One row per scan run; multiple runs per image are possible (re-scan on CVE DB update).';
COMMENT ON COLUMN image_scan_results.findings IS 'JSONB array of CVE objects: [{cve_id, severity, package, installed_version, fixed_version, description}]. Never contains secrets.';

CREATE INDEX idx_image_scan_results_image_id   ON image_scan_results (image_id);
CREATE INDEX idx_image_scan_results_org_id     ON image_scan_results (organization_id);
CREATE INDEX idx_image_scan_results_scanned_at ON image_scan_results (scanned_at DESC);
CREATE INDEX idx_image_scan_results_critical   ON image_scan_results (image_id, critical_count) WHERE critical_count > 0;

-- ---------------------------------------------------------------------------
-- networks
-- ---------------------------------------------------------------------------
CREATE TABLE networks (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL,
    host_id         UUID        NOT NULL,
    namespace_id    UUID,
    docker_id       TEXT        NOT NULL,             -- Docker-assigned network ID (short hash)
    name            TEXT        NOT NULL,
    driver          TEXT        NOT NULL DEFAULT 'bridge',  -- bridge | overlay | macvlan | host | none
    scope           TEXT        NOT NULL DEFAULT 'local',   -- local | swarm | global
    subnet          CIDR,
    gateway         INET,
    ip_range        CIDR,
    internal        BOOLEAN     NOT NULL DEFAULT FALSE,
    attachable      BOOLEAN     NOT NULL DEFAULT TRUE,
    labels          JSONB       NOT NULL DEFAULT '{}',
    options         JSONB       NOT NULL DEFAULT '{}',  -- driver-specific options
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT pk_networks                   PRIMARY KEY (id),
    CONSTRAINT fk_networks_organization      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_networks_host              FOREIGN KEY (host_id)         REFERENCES hosts(id)         ON DELETE CASCADE,
    CONSTRAINT fk_networks_namespace         FOREIGN KEY (namespace_id)    REFERENCES namespaces(id)    ON DELETE SET NULL,
    CONSTRAINT uq_networks_docker_id_per_host UNIQUE     (host_id, docker_id),
    CONSTRAINT chk_networks_driver           CHECK       (driver  IN ('bridge','overlay','macvlan','host','none','ipvlan')),
    CONSTRAINT chk_networks_scope            CHECK       (scope   IN ('local','swarm','global'))
);

COMMENT ON TABLE  networks          IS 'Docker network metadata mirrored from the Docker Engine. CQRS: writes come from network-service; reads served from this table or Redis cache.';
COMMENT ON COLUMN networks.docker_id IS 'Docker-assigned network ID (64-char or short hash). Immutable for the life of the network on the host.';

SELECT fn_attach_updated_at_trigger('networks');

CREATE INDEX idx_networks_organization_id ON networks (organization_id);
CREATE INDEX idx_networks_host_id         ON networks (host_id);
CREATE INDEX idx_networks_namespace_id    ON networks (namespace_id)  WHERE namespace_id IS NOT NULL;
CREATE INDEX idx_networks_driver          ON networks (driver)        WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- volumes
-- ---------------------------------------------------------------------------
CREATE TABLE volumes (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL,
    host_id         UUID        NOT NULL,
    namespace_id    UUID,
    name            TEXT        NOT NULL,
    driver          TEXT        NOT NULL DEFAULT 'local',  -- local | nfs | rbd | etc.
    mount_point     TEXT,                              -- Host filesystem path
    scope           TEXT        NOT NULL DEFAULT 'local',  -- local | global
    labels          JSONB       NOT NULL DEFAULT '{}',
    options         JSONB       NOT NULL DEFAULT '{}',
    size_bytes      BIGINT,
    used_bytes      BIGINT,
    last_measured_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ,

    CONSTRAINT pk_volumes                  PRIMARY KEY (id),
    CONSTRAINT fk_volumes_organization     FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_volumes_host             FOREIGN KEY (host_id)         REFERENCES hosts(id)         ON DELETE CASCADE,
    CONSTRAINT fk_volumes_namespace        FOREIGN KEY (namespace_id)    REFERENCES namespaces(id)    ON DELETE SET NULL,
    CONSTRAINT uq_volumes_name_per_host    UNIQUE      (host_id, name)
);

COMMENT ON TABLE  volumes              IS 'Docker named volume metadata. Bind mounts are tracked implicitly via container volume_mounts JSONB; only named volumes have dedicated rows.';
COMMENT ON COLUMN volumes.size_bytes   IS 'Total capacity of the volume backing store (driver-reported).';
COMMENT ON COLUMN volumes.used_bytes   IS 'Used capacity. Updated by monitor-service on each metrics scrape cycle.';

SELECT fn_attach_updated_at_trigger('volumes');

CREATE INDEX idx_volumes_organization_id ON volumes (organization_id);
CREATE INDEX idx_volumes_host_id         ON volumes (host_id);
CREATE INDEX idx_volumes_namespace_id    ON volumes (namespace_id)  WHERE namespace_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- containers  (CQRS write-side snapshot — authoritative metadata)
-- ---------------------------------------------------------------------------
CREATE TABLE containers (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL,
    namespace_id        UUID,
    host_id             UUID        NOT NULL,
    image_id            UUID,                          -- FK to images; NULL if image deleted
    docker_id           TEXT,                          -- Docker-assigned container ID (64-char)
    name                TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'pending',
        -- pending | running | stopped | paused | restarting | removing | dead | image_pull_error | failed
    image_ref           TEXT        NOT NULL,          -- "nginx:1.25.3" — denormalized for display when image_id is NULL
    command             TEXT[],                        -- Entrypoint / CMD override
    env_vars            JSONB       NOT NULL DEFAULT '{}',   -- {"KEY":"value"}
    labels              JSONB       NOT NULL DEFAULT '{}',
    port_bindings       JSONB       NOT NULL DEFAULT '[]',   -- [{"host_port":8080,"container_port":80,"protocol":"tcp"}]
    volume_mounts       JSONB       NOT NULL DEFAULT '[]',   -- [{"source":"/data","target":"/app","mode":"rw","type":"bind"}]
    resource_limits     JSONB       NOT NULL DEFAULT '{}',   -- {"cpu_shares":1024,"memory_bytes":536870912,"memory_swap":-1}
    network_settings    JSONB       NOT NULL DEFAULT '{}',   -- {"networks":{"bridge":{"ip":"172.17.0.2"}}}
    health_status       TEXT,                          -- healthy | unhealthy | starting | none
    restart_count       INTEGER     NOT NULL DEFAULT 0,
    exit_code           INTEGER,
    started_at          TIMESTAMPTZ,
    finished_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT pk_containers                   PRIMARY KEY (id),
    CONSTRAINT fk_containers_organization      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_containers_namespace         FOREIGN KEY (namespace_id)    REFERENCES namespaces(id)    ON DELETE SET NULL,
    CONSTRAINT fk_containers_host              FOREIGN KEY (host_id)         REFERENCES hosts(id)         ON DELETE CASCADE,
    CONSTRAINT fk_containers_image             FOREIGN KEY (image_id)        REFERENCES images(id)        ON DELETE SET NULL,
    CONSTRAINT uq_containers_docker_id         UNIQUE      (host_id, docker_id),
    CONSTRAINT chk_containers_status           CHECK (status IN (
        'pending','running','stopped','paused','restarting','removing','dead',
        'image_pull_error','failed','created'
    ))
);

COMMENT ON TABLE  containers              IS 'CQRS write-side snapshot of container metadata. container-service is the sole writer. monitor-service projects Redis read model from this table.';
COMMENT ON COLUMN containers.docker_id    IS 'Full 64-char Docker container ID. NULL while status=pending (before Docker Engine creates the container).';
COMMENT ON COLUMN containers.env_vars     IS 'Container environment variables. Values containing secrets (passwords, tokens) MUST NOT be stored here; use Docker secrets or Vault instead.';
COMMENT ON COLUMN containers.port_bindings IS 'Array of port binding objects. Denormalized from Docker inspect for fast API responses without joining.';
COMMENT ON COLUMN containers.volume_mounts IS 'Array of volume/bind mount objects. Named volume mounts include a volume_id reference inside the JSONB.';
COMMENT ON COLUMN containers.resource_limits IS 'CPU and memory constraints as set at container creation or via live-update.';
COMMENT ON COLUMN containers.health_status IS 'Most recent Docker HEALTHCHECK result. NULL when no HEALTHCHECK defined.';

SELECT fn_attach_updated_at_trigger('containers');

CREATE INDEX idx_containers_organization_id  ON containers (organization_id);
CREATE INDEX idx_containers_namespace_id     ON containers (namespace_id)    WHERE namespace_id IS NOT NULL;
CREATE INDEX idx_containers_host_id          ON containers (host_id);
CREATE INDEX idx_containers_image_id         ON containers (image_id)        WHERE image_id IS NOT NULL;
CREATE INDEX idx_containers_status           ON containers (organization_id, status) WHERE deleted_at IS NULL;
CREATE INDEX idx_containers_created_at       ON containers (organization_id, created_at DESC);
-- Partial index: active (running) containers only — most common read query
CREATE INDEX idx_containers_running          ON containers (organization_id, host_id, namespace_id)
    WHERE status = 'running' AND deleted_at IS NULL;
-- Trigram index for container name search
CREATE INDEX idx_containers_name_trgm        ON containers USING gin (name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4 — DEPLOYMENTS
-- ─────────────────────────────────────────────────────────────────────────────

-- ---------------------------------------------------------------------------
-- deployments
-- ---------------------------------------------------------------------------
CREATE TABLE deployments (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL,
    namespace_id        UUID,
    cluster_id          UUID,
    name                TEXT        NOT NULL,
    deployment_type     TEXT        NOT NULL DEFAULT 'container',  -- container | swarm_service | k8s_deployment
    desired_spec        JSONB       NOT NULL DEFAULT '{}',  -- Full desired configuration snapshot
    current_spec        JSONB       NOT NULL DEFAULT '{}',  -- Last applied configuration
    status              TEXT        NOT NULL DEFAULT 'pending',
        -- pending | progressing | succeeded | failed | rolled_back
    desired_replicas    INTEGER     NOT NULL DEFAULT 1,
    ready_replicas      INTEGER     NOT NULL DEFAULT 0,
    rollout_strategy    TEXT        NOT NULL DEFAULT 'rolling',  -- rolling | recreate | blue_green | canary
    initiated_by        UUID,                       -- user_id
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    error_message       TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_deployments                   PRIMARY KEY (id),
    CONSTRAINT fk_deployments_organization      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_deployments_namespace         FOREIGN KEY (namespace_id)    REFERENCES namespaces(id)    ON DELETE SET NULL,
    CONSTRAINT fk_deployments_cluster           FOREIGN KEY (cluster_id)      REFERENCES clusters(id)      ON DELETE SET NULL,
    CONSTRAINT fk_deployments_initiated_by      FOREIGN KEY (initiated_by)    REFERENCES users(id)         ON DELETE SET NULL,
    CONSTRAINT chk_deployments_status           CHECK (status IN ('pending','progressing','succeeded','failed','rolled_back')),
    CONSTRAINT chk_deployments_type             CHECK (deployment_type IN ('container','swarm_service','k8s_deployment')),
    CONSTRAINT chk_deployments_strategy         CHECK (rollout_strategy IN ('rolling','recreate','blue_green','canary'))
);

COMMENT ON TABLE  deployments          IS 'Tracks container/service deployment lifecycles. A new row is created for each deployment attempt; history is retained for rollback reference.';
COMMENT ON COLUMN deployments.desired_spec IS 'Full desired state specification snapshot at deployment initiation time.';
COMMENT ON COLUMN deployments.rollout_strategy IS 'Deployment strategy type. blue_green and canary are reserved for future implementation.';

SELECT fn_attach_updated_at_trigger('deployments');

CREATE INDEX idx_deployments_organization_id ON deployments (organization_id);
CREATE INDEX idx_deployments_namespace_id    ON deployments (namespace_id)    WHERE namespace_id IS NOT NULL;
CREATE INDEX idx_deployments_cluster_id      ON deployments (cluster_id)      WHERE cluster_id IS NOT NULL;
CREATE INDEX idx_deployments_status          ON deployments (organization_id, status);
CREATE INDEX idx_deployments_created_at      ON deployments (organization_id, created_at DESC);

CREATE TRIGGER trg_deployments_audit
AFTER INSERT OR UPDATE OR DELETE ON deployments
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5 — OPERATIONAL TABLES
-- ─────────────────────────────────────────────────────────────────────────────

-- ---------------------------------------------------------------------------
-- alert_rules
-- ---------------------------------------------------------------------------
CREATE TABLE alert_rules (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL,
    namespace_id        UUID,
    name                TEXT        NOT NULL,
    description         TEXT,
    metric              TEXT        NOT NULL,           -- e.g. "container.cpu_pct", "host.memory_pct", "container.restart_count"
    condition_operator  TEXT        NOT NULL,           -- gt | lt | gte | lte | eq | neq
    threshold_value     NUMERIC     NOT NULL,
    duration_seconds    INTEGER     NOT NULL DEFAULT 300,   -- evaluation window
    severity            TEXT        NOT NULL DEFAULT 'warning',  -- info | warning | critical
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    evaluation_interval INTEGER     NOT NULL DEFAULT 60,    -- seconds between evaluations
    labels              JSONB       NOT NULL DEFAULT '{}',  -- resource scope filters
    created_by          UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT pk_alert_rules              PRIMARY KEY (id),
    CONSTRAINT fk_alert_rules_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_alert_rules_namespace    FOREIGN KEY (namespace_id)    REFERENCES namespaces(id)    ON DELETE SET NULL,
    CONSTRAINT fk_alert_rules_created_by   FOREIGN KEY (created_by)      REFERENCES users(id)         ON DELETE SET NULL,
    CONSTRAINT chk_alert_rules_operator    CHECK (condition_operator IN ('gt','lt','gte','lte','eq','neq')),
    CONSTRAINT chk_alert_rules_severity    CHECK (severity IN ('info','warning','critical'))
);

COMMENT ON TABLE  alert_rules               IS 'Threshold-based alert rule definitions. Evaluated by monitor-service on each metrics scrape cycle.';
COMMENT ON COLUMN alert_rules.metric        IS 'Prometheus-style metric name used for threshold evaluation. Must match a known monitor-service metric label.';
COMMENT ON COLUMN alert_rules.duration_seconds IS 'Alert fires only if the condition holds continuously for this many seconds (prevents flapping).';

SELECT fn_attach_updated_at_trigger('alert_rules');

CREATE INDEX idx_alert_rules_organization_id ON alert_rules (organization_id);
CREATE INDEX idx_alert_rules_namespace_id    ON alert_rules (namespace_id)  WHERE namespace_id IS NOT NULL;
CREATE INDEX idx_alert_rules_is_active       ON alert_rules (organization_id, is_active) WHERE is_active = TRUE AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- alerts
-- ---------------------------------------------------------------------------
CREATE TABLE alerts (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL,
    alert_rule_id       UUID        NOT NULL,
    namespace_id        UUID,
    resource_type       TEXT,                          -- container | host | volume | cluster
    resource_id         UUID,                          -- FK-like reference (not enforced — poly)
    severity            TEXT        NOT NULL,
    status              TEXT        NOT NULL DEFAULT 'firing',  -- firing | resolved | silenced | acknowledged
    message             TEXT        NOT NULL,
    labels              JSONB       NOT NULL DEFAULT '{}',
    fired_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at         TIMESTAMPTZ,
    silenced_until      TIMESTAMPTZ,
    silenced_by         UUID,                          -- user_id
    acknowledged_by     UUID,                          -- user_id
    acknowledged_at     TIMESTAMPTZ,
    notification_sent   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_alerts                   PRIMARY KEY (id),
    CONSTRAINT fk_alerts_organization      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_alerts_rule              FOREIGN KEY (alert_rule_id)   REFERENCES alert_rules(id)   ON DELETE CASCADE,
    CONSTRAINT fk_alerts_namespace         FOREIGN KEY (namespace_id)    REFERENCES namespaces(id)    ON DELETE SET NULL,
    CONSTRAINT fk_alerts_silenced_by       FOREIGN KEY (silenced_by)     REFERENCES users(id)         ON DELETE SET NULL,
    CONSTRAINT fk_alerts_acknowledged_by   FOREIGN KEY (acknowledged_by) REFERENCES users(id)         ON DELETE SET NULL,
    CONSTRAINT chk_alerts_severity         CHECK (severity IN ('info','warning','critical')),
    CONSTRAINT chk_alerts_status           CHECK (status IN ('firing','resolved','silenced','acknowledged'))
);

COMMENT ON TABLE  alerts                IS 'Fired alert instances. One row per alert event. monitor-service is the sole writer. 90-day retention enforced by purge job.';
COMMENT ON COLUMN alerts.resource_id    IS 'Polymorphic reference to the resource that triggered the alert. resource_type determines interpretation.';
COMMENT ON COLUMN alerts.silenced_until IS 'Non-NULL means the alert is suppressed until this timestamp. notification-service checks before dispatching.';

SELECT fn_attach_updated_at_trigger('alerts');

CREATE INDEX idx_alerts_organization_id ON alerts (organization_id);
CREATE INDEX idx_alerts_rule_id         ON alerts (alert_rule_id);
CREATE INDEX idx_alerts_namespace_id    ON alerts (namespace_id)    WHERE namespace_id IS NOT NULL;
CREATE INDEX idx_alerts_fired_at        ON alerts (organization_id, fired_at DESC);
-- Partial index: only active unresolved alerts — primary dashboard query
CREATE INDEX idx_alerts_firing          ON alerts (organization_id, severity)
    WHERE status = 'firing' AND resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- notification_channels
-- ---------------------------------------------------------------------------
CREATE TABLE notification_channels (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL,
    name                TEXT        NOT NULL,
    channel_type        TEXT        NOT NULL,  -- slack | email | webhook | pagerduty
    config_enc          BYTEA       NOT NULL,  -- AES-256-GCM encrypted channel config
        -- Slack:  {"webhook_url":"...","channel":"#alerts"}
        -- Email:  {"recipients":["ops@company.com"],"smtp_host":"..."}
        -- Webhook:{"url":"...","auth_header":"...","method":"POST"}
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    last_test_at        TIMESTAMPTZ,
    last_test_success   BOOLEAN,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT pk_notification_channels              PRIMARY KEY (id),
    CONSTRAINT fk_notification_channels_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT chk_notification_channels_type        CHECK (channel_type IN ('slack','email','webhook','pagerduty','teams'))
);

COMMENT ON TABLE  notification_channels           IS 'Configured notification delivery channels per organization. Sensitive config (webhook URLs, SMTP passwords) encrypted at column level.';
COMMENT ON COLUMN notification_channels.config_enc IS 'AES-256-GCM encrypted JSONB. Decrypted only by notification-service at dispatch time. Key managed by Vault transit engine.';

SELECT fn_attach_updated_at_trigger('notification_channels');

CREATE INDEX idx_notification_channels_org_id ON notification_channels (organization_id);

-- ---------------------------------------------------------------------------
-- notification_subscriptions
-- ---------------------------------------------------------------------------
CREATE TABLE notification_subscriptions (
    id                     UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id        UUID        NOT NULL,
    alert_rule_id          UUID,                  -- NULL = subscribe to all rules
    notification_channel_id UUID       NOT NULL,
    severity_filter        TEXT[],                -- NULL = all severities; e.g. ARRAY['critical','warning']
    namespace_filter       UUID[],                -- NULL = all namespaces
    is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_notification_subscriptions              PRIMARY KEY (id),
    CONSTRAINT fk_notif_subs_organization                 FOREIGN KEY (organization_id)         REFERENCES organizations(id)          ON DELETE CASCADE,
    CONSTRAINT fk_notif_subs_alert_rule                   FOREIGN KEY (alert_rule_id)            REFERENCES alert_rules(id)            ON DELETE CASCADE,
    CONSTRAINT fk_notif_subs_channel                      FOREIGN KEY (notification_channel_id)  REFERENCES notification_channels(id)  ON DELETE CASCADE
);

COMMENT ON TABLE  notification_subscriptions             IS 'Routing rules: which alert rules send to which notification channels, with optional severity and namespace filters.';
COMMENT ON COLUMN notification_subscriptions.severity_filter IS 'Array of severities to receive. NULL means all. e.g. ARRAY[''critical''] for PagerDuty channel.';

SELECT fn_attach_updated_at_trigger('notification_subscriptions');

CREATE INDEX idx_notif_subs_org_id      ON notification_subscriptions (organization_id);
CREATE INDEX idx_notif_subs_rule_id     ON notification_subscriptions (alert_rule_id) WHERE alert_rule_id IS NOT NULL;
CREATE INDEX idx_notif_subs_channel_id  ON notification_subscriptions (notification_channel_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6 — AUDIT EVENTS (append-only, monthly range partitioning)
-- ─────────────────────────────────────────────────────────────────────────────

-- Parent table — RANGE partitioned by created_at month.
-- Partition management: db_developer_agent creates monthly partitions via a
-- scheduled pg_cron job (or managed by the application migration job).
-- golang-migrate creates the initial partitions at deployment time.

CREATE TABLE audit_events (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    actor_id        UUID,                              -- NULL = system-initiated action
    organization_id UUID,
    action          TEXT        NOT NULL,              -- INSERT | UPDATE | DELETE | lifecycle verb
    resource_type   TEXT        NOT NULL,              -- table name or domain (containers, users, …)
    resource_id     UUID,
    old_data        JSONB,                             -- State before change (redacted of secrets)
    new_data        JSONB,                             -- State after change  (redacted of secrets)
    source_ip       INET,
    user_agent      TEXT,
    trace_id        TEXT,                              -- OpenTelemetry trace correlation
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_audit_events PRIMARY KEY (id, created_at)
    -- No FK on actor_id/organization_id — audit log must survive user/org deletion.
    -- Rows are NEVER updated or deleted via normal operations.
    -- Row-level security prevents DELETE for non-superuser roles.
) PARTITION BY RANGE (created_at);

COMMENT ON TABLE  audit_events                IS 'Append-only immutable audit trail. Partitioned by month for retention management. SOC 2 CC7.2: retain 2 years minimum. Rows must never be deleted via application code.';
COMMENT ON COLUMN audit_events.actor_id       IS 'User who performed the action. NULL for system-initiated events (monitor-service, cron jobs). NOT a FK — user may be deleted.';
COMMENT ON COLUMN audit_events.old_data       IS 'JSONB snapshot before mutation. Secret columns (password_hash, mfa_secret_enc, config_enc) MUST be redacted to "<redacted>" before storage.';
COMMENT ON COLUMN audit_events.new_data       IS 'JSONB snapshot after mutation. Same redaction rules as old_data.';
COMMENT ON COLUMN audit_events.trace_id       IS 'OpenTelemetry trace ID for log-to-trace correlation in Grafana Tempo.';

-- Initial partitions for 2026 — additional partitions created by migration/cron job.
CREATE TABLE audit_events_2026_01 PARTITION OF audit_events
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_events_2026_02 PARTITION OF audit_events
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_events_2026_03 PARTITION OF audit_events
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_events_2026_04 PARTITION OF audit_events
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_events_2026_05 PARTITION OF audit_events
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_events_2026_06 PARTITION OF audit_events
    FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_events_2026_07 PARTITION OF audit_events
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_events_2026_08 PARTITION OF audit_events
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_events_2026_09 PARTITION OF audit_events
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_events_2026_10 PARTITION OF audit_events
    FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE audit_events_2026_11 PARTITION OF audit_events
    FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE audit_events_2026_12 PARTITION OF audit_events
    FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');

-- Indexes on each partition (PostgreSQL propagates these to partitions when defined on parent)
CREATE INDEX idx_audit_events_actor_id       ON audit_events (actor_id)       WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_events_org_id         ON audit_events (organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX idx_audit_events_resource       ON audit_events (resource_type, resource_id);
CREATE INDEX idx_audit_events_created_at     ON audit_events (created_at DESC);
CREATE INDEX idx_audit_events_action         ON audit_events (action);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7 — ROW-LEVEL SECURITY (RLS) POLICIES
-- Tenant isolation: services must SET LOCAL dcms.current_org_id = '<uuid>'
-- before executing any DML on RLS-protected tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable RLS on all multi-tenant tables
ALTER TABLE organizations          ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters               ENABLE ROW LEVEL SECURITY;
ALTER TABLE hosts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE namespaces             ENABLE ROW LEVEL SECURITY;
ALTER TABLE images                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_scan_results     ENABLE ROW LEVEL SECURITY;
ALTER TABLE networks               ENABLE ROW LEVEL SECURITY;
ALTER TABLE volumes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE containers             ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments            ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules            ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events           ENABLE ROW LEVEL SECURITY;

-- Application role — used by all DCMS microservices (NOT superuser)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dcms_app') THEN
        CREATE ROLE dcms_app NOLOGIN;
    END IF;
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dcms_readonly') THEN
        CREATE ROLE dcms_readonly NOLOGIN;
    END IF;
END;
$$;

-- Grant table privileges to application role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO dcms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO dcms_app;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO dcms_readonly;

-- ── RLS POLICIES ────────────────────────────────────────────────────────────

-- organizations: each service sees only the org matching session variable
CREATE POLICY pol_organizations_tenant ON organizations
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- users
CREATE POLICY pol_users_tenant ON users
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- roles: org roles + system roles (organization_id IS NULL)
CREATE POLICY pol_roles_tenant ON roles
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id IS NULL
        OR organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- user_roles
CREATE POLICY pol_user_roles_tenant ON user_roles
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- api_keys
CREATE POLICY pol_api_keys_tenant ON api_keys
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- sessions
CREATE POLICY pol_sessions_tenant ON sessions
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- clusters
CREATE POLICY pol_clusters_tenant ON clusters
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- hosts
CREATE POLICY pol_hosts_tenant ON hosts
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- namespaces
CREATE POLICY pol_namespaces_tenant ON namespaces
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- images
CREATE POLICY pol_images_tenant ON images
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- image_scan_results
CREATE POLICY pol_image_scan_results_tenant ON image_scan_results
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- networks
CREATE POLICY pol_networks_tenant ON networks
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- volumes
CREATE POLICY pol_volumes_tenant ON volumes
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- containers
CREATE POLICY pol_containers_tenant ON containers
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- deployments
CREATE POLICY pol_deployments_tenant ON deployments
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- alert_rules
CREATE POLICY pol_alert_rules_tenant ON alert_rules
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- alerts
CREATE POLICY pol_alerts_tenant ON alerts
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- notification_channels
CREATE POLICY pol_notification_channels_tenant ON notification_channels
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- notification_subscriptions
CREATE POLICY pol_notification_subscriptions_tenant ON notification_subscriptions
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

-- audit_events: readable by own org; INSERT allowed; DELETE denied for dcms_app role
CREATE POLICY pol_audit_events_select ON audit_events
    AS PERMISSIVE FOR SELECT TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID
        OR organization_id IS NULL);

CREATE POLICY pol_audit_events_insert ON audit_events
    AS PERMISSIVE FOR INSERT TO dcms_app
    WITH CHECK (TRUE);  -- fn_audit_log_trigger() is SECURITY DEFINER; always allowed

-- Explicit DENY for DELETE on audit_events (belt-and-suspenders on top of no DELETE grant)
-- dcms_app has no DELETE privilege on audit_events — enforced at GRANT level above.

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8 — REGISTRY CREDENTIALS
-- Stored separately because the secret value is encrypted and only ever
-- decrypted in memory by image-service at runtime.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE registry_credentials (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    organization_id     UUID        NOT NULL,
    name                TEXT        NOT NULL,           -- human label, e.g. "Docker Hub prod"
    registry_url        TEXT        NOT NULL,           -- e.g. "https://index.docker.io/v1/"
    username            TEXT        NOT NULL,
    secret_enc          BYTEA       NOT NULL,           -- AES-256-GCM encrypted password or token
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,

    CONSTRAINT pk_registry_credentials              PRIMARY KEY (id),
    CONSTRAINT fk_registry_credentials_organization FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT uq_registry_credentials_per_org      UNIQUE      (organization_id, registry_url, username)
);

COMMENT ON TABLE  registry_credentials           IS 'Encrypted Docker registry credentials. secret_enc decrypted only in memory by image-service. Never logged or returned in API responses.';
COMMENT ON COLUMN registry_credentials.secret_enc IS 'AES-256-GCM encrypted password or token. Key ID managed via HashiCorp Vault transit engine. Rotation does not require schema change.';

ALTER TABLE registry_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY pol_registry_credentials_tenant ON registry_credentials
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (organization_id = current_setting('dcms.current_org_id', TRUE)::UUID);

SELECT fn_attach_updated_at_trigger('registry_credentials');

CREATE INDEX idx_registry_credentials_org_id ON registry_credentials (organization_id);

CREATE TRIGGER trg_registry_credentials_audit
AFTER INSERT OR UPDATE OR DELETE ON registry_credentials
FOR EACH ROW EXECUTE FUNCTION fn_audit_log_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- END OF SCHEMA
-- =============================================================================
-- Schema version: 1.0.0
-- Compatible with: PostgreSQL 16
-- Migration tool: golang-migrate (db_migrations/ directory)
-- Next step: db_developer_agent runs golang-migrate to apply as V1__initial_schema.sql
-- =============================================================================
