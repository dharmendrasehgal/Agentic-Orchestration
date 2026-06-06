-- Migration: 000015_add_rls_policies (DOWN)
-- Purpose: Remove all RLS policies, disable RLS on all tables, drop dcms_app role and helper function.

-- -------------------------------------------------------------------------
-- 1. Drop all RLS policies (policy name = org_isolation on each table)
-- -------------------------------------------------------------------------

DROP POLICY IF EXISTS org_isolation ON notification_subscriptions;
DROP POLICY IF EXISTS org_isolation ON deployments;
DROP POLICY IF EXISTS org_isolation ON alerts;
DROP POLICY IF EXISTS org_isolation ON alert_rules;
DROP POLICY IF EXISTS org_isolation ON volumes;
DROP POLICY IF EXISTS org_isolation ON networks;
DROP POLICY IF EXISTS org_isolation ON containers;
DROP POLICY IF EXISTS org_isolation ON hosts;
DROP POLICY IF EXISTS org_isolation ON audit_events;
DROP POLICY IF EXISTS org_isolation ON notification_channels;
DROP POLICY IF EXISTS org_isolation ON images;
DROP POLICY IF EXISTS org_isolation ON namespaces;
DROP POLICY IF EXISTS org_isolation ON clusters;
DROP POLICY IF EXISTS org_isolation ON api_keys;
DROP POLICY IF EXISTS org_isolation ON sessions;
DROP POLICY IF EXISTS org_isolation ON roles;
DROP POLICY IF EXISTS org_isolation ON users;
DROP POLICY IF EXISTS org_isolation ON organizations;

-- -------------------------------------------------------------------------
-- 2. Disable FORCE RLS and RLS on all tables
-- -------------------------------------------------------------------------

ALTER TABLE deployments                NO FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events               NO FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_subscriptions NO FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_channels      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE alerts                     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE alert_rules                NO FORCE ROW LEVEL SECURITY;
ALTER TABLE volumes                    NO FORCE ROW LEVEL SECURITY;
ALTER TABLE networks                   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE images                     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE containers                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE hosts                      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE namespaces                 NO FORCE ROW LEVEL SECURITY;
ALTER TABLE clusters                   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE api_keys                   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions                   NO FORCE ROW LEVEL SECURITY;
ALTER TABLE roles                      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE users                      NO FORCE ROW LEVEL SECURITY;
ALTER TABLE organizations              NO FORCE ROW LEVEL SECURITY;

ALTER TABLE deployments                DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events               DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_subscriptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE notification_channels      DISABLE ROW LEVEL SECURITY;
ALTER TABLE alerts                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules                DISABLE ROW LEVEL SECURITY;
ALTER TABLE volumes                    DISABLE ROW LEVEL SECURITY;
ALTER TABLE networks                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE images                     DISABLE ROW LEVEL SECURITY;
ALTER TABLE containers                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE hosts                      DISABLE ROW LEVEL SECURITY;
ALTER TABLE namespaces                 DISABLE ROW LEVEL SECURITY;
ALTER TABLE clusters                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE sessions                   DISABLE ROW LEVEL SECURITY;
ALTER TABLE roles                      DISABLE ROW LEVEL SECURITY;
ALTER TABLE users                      DISABLE ROW LEVEL SECURITY;
ALTER TABLE organizations              DISABLE ROW LEVEL SECURITY;

-- -------------------------------------------------------------------------
-- 3. Drop helper function
-- -------------------------------------------------------------------------

DROP FUNCTION IF EXISTS dcms_current_org_id();

-- -------------------------------------------------------------------------
-- 4. Revoke grants from dcms_app and drop the role
-- -------------------------------------------------------------------------

REVOKE ALL ON TABLE organizations              FROM dcms_app;
REVOKE ALL ON TABLE users                      FROM dcms_app;
REVOKE ALL ON TABLE roles                      FROM dcms_app;
REVOKE ALL ON TABLE permissions                FROM dcms_app;
REVOKE ALL ON TABLE user_roles                 FROM dcms_app;
REVOKE ALL ON TABLE role_permissions           FROM dcms_app;
REVOKE ALL ON TABLE sessions                   FROM dcms_app;
REVOKE ALL ON TABLE api_keys                   FROM dcms_app;
REVOKE ALL ON TABLE clusters                   FROM dcms_app;
REVOKE ALL ON TABLE hosts                      FROM dcms_app;
REVOKE ALL ON TABLE namespaces                 FROM dcms_app;
REVOKE ALL ON TABLE containers                 FROM dcms_app;
REVOKE ALL ON TABLE images                     FROM dcms_app;
REVOKE ALL ON TABLE image_tags                 FROM dcms_app;
REVOKE ALL ON TABLE image_scan_results         FROM dcms_app;
REVOKE ALL ON TABLE networks                   FROM dcms_app;
REVOKE ALL ON TABLE volumes                    FROM dcms_app;
REVOKE ALL ON TABLE alert_rules                FROM dcms_app;
REVOKE ALL ON TABLE alerts                     FROM dcms_app;
REVOKE ALL ON TABLE notification_channels      FROM dcms_app;
REVOKE ALL ON TABLE notification_subscriptions FROM dcms_app;
REVOKE ALL ON TABLE audit_events               FROM dcms_app;
REVOKE ALL ON TABLE deployments                FROM dcms_app;

DROP ROLE IF EXISTS dcms_app;
