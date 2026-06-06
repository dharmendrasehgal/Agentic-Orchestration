-- Migration: 000015_add_rls_policies (UP)
-- Purpose: Row Level Security for multi-tenant isolation.
--          Every tenant-scoped table enforces that the authenticated application
--          role can only see rows belonging to the org declared in the session
--          local variable dcms.current_org_id.
--
-- Design:
--   1. Create a least-privilege application role (dcms_app).
--   2. Enable RLS on all org-scoped tables.
--   3. Create isolation policies using current_setting('dcms.current_org_id')::uuid.
--   4. Revoke broad public access; grant only what dcms_app needs.
--
-- Usage pattern (application code):
--   SET LOCAL dcms.current_org_id = '<org-uuid>';
--   -- subsequent queries are automatically filtered by RLS


-- -------------------------------------------------------------------------
-- 1. Application role
-- -------------------------------------------------------------------------

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dcms_app') THEN
        CREATE ROLE dcms_app NOLOGIN;
    END IF;
END;
$$;

-- -------------------------------------------------------------------------
-- 2. Revoke default public grants on all tenant-scoped tables
-- -------------------------------------------------------------------------

REVOKE ALL ON TABLE organizations             FROM PUBLIC;
REVOKE ALL ON TABLE users                     FROM PUBLIC;
REVOKE ALL ON TABLE roles                     FROM PUBLIC;
REVOKE ALL ON TABLE permissions               FROM PUBLIC;
REVOKE ALL ON TABLE user_roles                FROM PUBLIC;
REVOKE ALL ON TABLE role_permissions          FROM PUBLIC;
REVOKE ALL ON TABLE sessions                  FROM PUBLIC;
REVOKE ALL ON TABLE api_keys                  FROM PUBLIC;
REVOKE ALL ON TABLE clusters                  FROM PUBLIC;
REVOKE ALL ON TABLE hosts                     FROM PUBLIC;
REVOKE ALL ON TABLE namespaces                FROM PUBLIC;
REVOKE ALL ON TABLE containers                FROM PUBLIC;
REVOKE ALL ON TABLE images                    FROM PUBLIC;
REVOKE ALL ON TABLE image_tags                FROM PUBLIC;
REVOKE ALL ON TABLE image_scan_results        FROM PUBLIC;
REVOKE ALL ON TABLE networks                  FROM PUBLIC;
REVOKE ALL ON TABLE volumes                   FROM PUBLIC;
REVOKE ALL ON TABLE alert_rules               FROM PUBLIC;
REVOKE ALL ON TABLE alerts                    FROM PUBLIC;
REVOKE ALL ON TABLE notification_channels     FROM PUBLIC;
REVOKE ALL ON TABLE notification_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE audit_events              FROM PUBLIC;
REVOKE ALL ON TABLE deployments               FROM PUBLIC;

-- -------------------------------------------------------------------------
-- 3. Grant appropriate privileges to dcms_app
-- -------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE organizations              TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE users                      TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE roles                      TO dcms_app;
GRANT SELECT                          ON TABLE permissions               TO dcms_app;
GRANT SELECT, INSERT, DELETE          ON TABLE user_roles                TO dcms_app;
GRANT SELECT                          ON TABLE role_permissions          TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE sessions                  TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE api_keys                  TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE clusters                  TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE hosts                     TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE namespaces                TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE containers                TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE images                    TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE image_tags                TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE image_scan_results        TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE networks                  TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE volumes                   TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE alert_rules               TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE alerts                    TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE notification_channels     TO dcms_app;
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE notification_subscriptions TO dcms_app;
GRANT SELECT, INSERT                  ON TABLE audit_events              TO dcms_app;  -- no UPDATE/DELETE: immutable
GRANT SELECT, INSERT, UPDATE, DELETE  ON TABLE deployments               TO dcms_app;

-- -------------------------------------------------------------------------
-- 4. Enable RLS on all tenant-scoped tables
-- -------------------------------------------------------------------------

ALTER TABLE organizations              ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE clusters                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE namespaces                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE images                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels      ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events               ENABLE ROW LEVEL SECURITY;
ALTER TABLE deployments                ENABLE ROW LEVEL SECURITY;

-- Tables isolated via namespace_id -> namespaces.org_id chain
-- (direct org_id column approach used where available for performance)
ALTER TABLE hosts                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE containers                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE networks                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE volumes                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules                ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_subscriptions ENABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 5. Helper function: safely read current org from session local
-- -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION dcms_current_org_id() RETURNS UUID
    LANGUAGE sql STABLE SECURITY DEFINER
AS $$
    SELECT NULLIF(current_setting('dcms.current_org_id', TRUE), '')::UUID;
$$;

-- -------------------------------------------------------------------------
-- 6. RLS policies — direct org_id tables
-- -------------------------------------------------------------------------

-- organizations: can only see own org
CREATE POLICY org_isolation ON organizations
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (id = dcms_current_org_id());

-- users: scoped to current org
CREATE POLICY org_isolation ON users
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (org_id = dcms_current_org_id());

-- roles: system roles (org_id IS NULL) are visible to all; tenant roles are org-scoped
CREATE POLICY org_isolation ON roles
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (org_id IS NULL OR org_id = dcms_current_org_id());

-- sessions: visible to the org that owns the user (join through users table)
CREATE POLICY org_isolation ON sessions
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (
        EXISTS (
            SELECT 1 FROM users u
            WHERE u.id = sessions.user_id
              AND u.org_id = dcms_current_org_id()
        )
    );

-- api_keys
CREATE POLICY org_isolation ON api_keys
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (org_id = dcms_current_org_id());

-- clusters
CREATE POLICY org_isolation ON clusters
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (org_id = dcms_current_org_id());

-- namespaces
CREATE POLICY org_isolation ON namespaces
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (org_id = dcms_current_org_id());

-- images
CREATE POLICY org_isolation ON images
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (org_id = dcms_current_org_id());

-- notification_channels
CREATE POLICY org_isolation ON notification_channels
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (org_id = dcms_current_org_id());

-- audit_events
CREATE POLICY org_isolation ON audit_events
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (org_id = dcms_current_org_id());

-- -------------------------------------------------------------------------
-- 7. RLS policies — tables isolated via namespace_id FK
--    (namespace carries org_id; subquery avoids cross-table joins at planner level)
-- -------------------------------------------------------------------------

CREATE POLICY org_isolation ON hosts
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (
        EXISTS (
            SELECT 1 FROM clusters c
            WHERE c.id = hosts.cluster_id
              AND c.org_id = dcms_current_org_id()
        )
    );

CREATE POLICY org_isolation ON containers
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (
        EXISTS (
            SELECT 1 FROM namespaces ns
            WHERE ns.id = containers.namespace_id
              AND ns.org_id = dcms_current_org_id()
        )
    );

CREATE POLICY org_isolation ON networks
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (
        EXISTS (
            SELECT 1 FROM namespaces ns
            WHERE ns.id = networks.namespace_id
              AND ns.org_id = dcms_current_org_id()
        )
    );

CREATE POLICY org_isolation ON volumes
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (
        EXISTS (
            SELECT 1 FROM namespaces ns
            WHERE ns.id = volumes.namespace_id
              AND ns.org_id = dcms_current_org_id()
        )
    );

CREATE POLICY org_isolation ON alert_rules
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (
        EXISTS (
            SELECT 1 FROM namespaces ns
            WHERE ns.id = alert_rules.namespace_id
              AND ns.org_id = dcms_current_org_id()
        )
    );

CREATE POLICY org_isolation ON alerts
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (
        EXISTS (
            SELECT 1 FROM namespaces ns
            WHERE ns.id = alerts.namespace_id
              AND ns.org_id = dcms_current_org_id()
        )
    );

CREATE POLICY org_isolation ON deployments
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (
        EXISTS (
            SELECT 1 FROM namespaces ns
            WHERE ns.id = deployments.namespace_id
              AND ns.org_id = dcms_current_org_id()
        )
    );

CREATE POLICY org_isolation ON notification_subscriptions
    AS PERMISSIVE FOR ALL TO dcms_app
    USING (
        EXISTS (
            SELECT 1 FROM notification_channels nc
            WHERE nc.id = notification_subscriptions.channel_id
              AND nc.org_id = dcms_current_org_id()
        )
    );

-- -------------------------------------------------------------------------
-- 8. FORCE RLS so table owners are also subject to policies
--    (prevents accidental bypass by a superuser-like app account)
-- -------------------------------------------------------------------------

ALTER TABLE organizations              FORCE ROW LEVEL SECURITY;
ALTER TABLE users                      FORCE ROW LEVEL SECURITY;
ALTER TABLE roles                      FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions                   FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys                   FORCE ROW LEVEL SECURITY;
ALTER TABLE clusters                   FORCE ROW LEVEL SECURITY;
ALTER TABLE namespaces                 FORCE ROW LEVEL SECURITY;
ALTER TABLE hosts                      FORCE ROW LEVEL SECURITY;
ALTER TABLE containers                 FORCE ROW LEVEL SECURITY;
ALTER TABLE images                     FORCE ROW LEVEL SECURITY;
ALTER TABLE networks                   FORCE ROW LEVEL SECURITY;
ALTER TABLE volumes                    FORCE ROW LEVEL SECURITY;
ALTER TABLE alert_rules                FORCE ROW LEVEL SECURITY;
ALTER TABLE alerts                     FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_channels      FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events               FORCE ROW LEVEL SECURITY;
ALTER TABLE deployments                FORCE ROW LEVEL SECURITY;
