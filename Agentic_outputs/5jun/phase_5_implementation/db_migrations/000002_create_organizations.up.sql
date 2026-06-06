-- Migration: 000002_create_organizations (UP)
-- Purpose: Create organizations table — top-level tenant anchor for all DCMS resources

CREATE TABLE organizations (
    id          UUID        NOT NULL DEFAULT uuid_generate_v4(),
    name        VARCHAR(255) NOT NULL,
    slug        VARCHAR(100) NOT NULL,
    plan        VARCHAR(50)  NOT NULL DEFAULT 'free',   -- free | pro | enterprise
    settings    JSONB        NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    deleted_at  TIMESTAMPTZ,

    CONSTRAINT organizations_pkey         PRIMARY KEY (id),
    CONSTRAINT organizations_slug_unique  UNIQUE (slug),
    CONSTRAINT organizations_slug_format  CHECK (slug ~ '^[a-z0-9][a-z0-9\-]{1,98}[a-z0-9]$')
);

CREATE INDEX idx_organizations_deleted_at ON organizations (deleted_at)
    WHERE deleted_at IS NULL;

COMMENT ON TABLE  organizations              IS 'Top-level multi-tenant unit; every resource belongs to exactly one organization.';
COMMENT ON COLUMN organizations.slug        IS 'URL-safe, globally unique identifier used in API paths.';
COMMENT ON COLUMN organizations.plan        IS 'Subscription plan controlling feature flags and resource quotas.';
COMMENT ON COLUMN organizations.settings    IS 'Flexible key-value bag for plan overrides, branding, etc.';
COMMENT ON COLUMN organizations.deleted_at  IS 'Soft-delete timestamp; NULL means the organization is active.';
