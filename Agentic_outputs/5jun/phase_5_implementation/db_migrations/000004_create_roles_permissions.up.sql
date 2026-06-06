-- Migration: 000004_create_roles_permissions (UP)
-- Purpose: RBAC tables — roles, permissions, user_roles, role_permissions; seed default data

-- -------------------------------------------------------------------------
-- Tables
-- -------------------------------------------------------------------------

CREATE TABLE roles (
    id          UUID         NOT NULL DEFAULT uuid_generate_v4(),
    org_id      UUID,                                   -- NULL = system-wide built-in role
    name        VARCHAR(100) NOT NULL,
    description TEXT,
    is_system   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT roles_pkey              PRIMARY KEY (id),
    CONSTRAINT roles_org_name_unique   UNIQUE (org_id, name),
    CONSTRAINT roles_org_id_fk         FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE TABLE permissions (
    id           UUID         NOT NULL DEFAULT uuid_generate_v4(),
    resource     VARCHAR(100) NOT NULL,   -- e.g. containers, clusters, images
    action       VARCHAR(50)  NOT NULL,   -- e.g. read, write, delete, exec
    description  TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT permissions_pkey             PRIMARY KEY (id),
    CONSTRAINT permissions_resource_action  UNIQUE (resource, action)
);

CREATE TABLE user_roles (
    user_id     UUID        NOT NULL,
    role_id     UUID        NOT NULL,
    granted_by  UUID,                     -- FK to users; nullable for seed/system grants
    granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT user_roles_pkey      PRIMARY KEY (user_id, role_id),
    CONSTRAINT user_roles_user_fk   FOREIGN KEY (user_id)    REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT user_roles_role_fk   FOREIGN KEY (role_id)    REFERENCES roles (id) ON DELETE CASCADE,
    CONSTRAINT user_roles_granter_fk FOREIGN KEY (granted_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE role_permissions (
    role_id        UUID NOT NULL,
    permission_id  UUID NOT NULL,

    CONSTRAINT role_permissions_pkey       PRIMARY KEY (role_id, permission_id),
    CONSTRAINT role_permissions_role_fk    FOREIGN KEY (role_id)       REFERENCES roles (id)       ON DELETE CASCADE,
    CONSTRAINT role_permissions_perm_fk    FOREIGN KEY (permission_id) REFERENCES permissions (id) ON DELETE CASCADE
);

-- -------------------------------------------------------------------------
-- Indexes
-- -------------------------------------------------------------------------

CREATE INDEX idx_roles_org_id          ON roles (org_id)  WHERE org_id IS NOT NULL;
CREATE INDEX idx_user_roles_user_id    ON user_roles (user_id);
CREATE INDEX idx_user_roles_role_id    ON user_roles (role_id);

-- -------------------------------------------------------------------------
-- Seed: system roles (org_id IS NULL = built-in, cannot be deleted by tenants)
-- -------------------------------------------------------------------------

INSERT INTO roles (id, org_id, name, description, is_system, created_at, updated_at) VALUES
    ('00000000-0000-0000-0000-000000000001', NULL, 'admin',
     'Full administrative access to all resources within the organization', TRUE, NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000002', NULL, 'operator',
     'Operational access: can manage containers, deployments and view all resources', TRUE, NOW(), NOW()),
    ('00000000-0000-0000-0000-000000000003', NULL, 'viewer',
     'Read-only access to all resources within the organization', TRUE, NOW(), NOW());

-- -------------------------------------------------------------------------
-- Seed: permissions (resource x action matrix)
-- -------------------------------------------------------------------------

INSERT INTO permissions (id, resource, action, description) VALUES
    -- containers
    ('10000000-0000-0000-0000-000000000001', 'containers', 'read',   'List and inspect containers'),
    ('10000000-0000-0000-0000-000000000002', 'containers', 'write',  'Create, update and restart containers'),
    ('10000000-0000-0000-0000-000000000003', 'containers', 'delete', 'Remove containers'),
    ('10000000-0000-0000-0000-000000000004', 'containers', 'exec',   'Execute commands inside containers'),
    -- clusters
    ('10000000-0000-0000-0000-000000000005', 'clusters', 'read',   'View cluster topology and health'),
    ('10000000-0000-0000-0000-000000000006', 'clusters', 'write',  'Register and configure clusters'),
    ('10000000-0000-0000-0000-000000000007', 'clusters', 'delete', 'Remove clusters from DCMS'),
    -- images
    ('10000000-0000-0000-0000-000000000008', 'images', 'read',   'Browse image catalog'),
    ('10000000-0000-0000-0000-000000000009', 'images', 'write',  'Pull and tag images'),
    ('10000000-0000-0000-0000-000000000010', 'images', 'delete', 'Remove images from registry cache'),
    -- audit
    ('10000000-0000-0000-0000-000000000011', 'audit_events', 'read',   'View audit log'),
    -- admin
    ('10000000-0000-0000-0000-000000000012', 'organizations', 'admin', 'Full org administration including user and role management');

-- -------------------------------------------------------------------------
-- Seed: role_permissions assignments
-- admin  -> all permissions
-- operator -> containers (read/write/exec), clusters (read), images (read/write)
-- viewer -> read-only permissions on containers, clusters, images
-- -------------------------------------------------------------------------

-- admin gets everything
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', id FROM permissions;

-- operator permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000002', id FROM permissions
WHERE (resource = 'containers' AND action IN ('read', 'write', 'exec'))
   OR (resource = 'clusters'   AND action = 'read')
   OR (resource = 'images'     AND action IN ('read', 'write'));

-- viewer permissions (all read actions)
INSERT INTO role_permissions (role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000003', id FROM permissions
WHERE action = 'read';

COMMENT ON TABLE roles            IS 'RBAC roles; system roles (is_system=true) cannot be modified by tenants.';
COMMENT ON TABLE permissions      IS 'Fine-grained permission registry (resource + action pairs).';
COMMENT ON TABLE user_roles       IS 'Many-to-many assignment of roles to users.';
COMMENT ON TABLE role_permissions IS 'Many-to-many assignment of permissions to roles.';
