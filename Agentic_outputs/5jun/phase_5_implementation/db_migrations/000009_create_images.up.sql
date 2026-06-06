-- Migration: 000009_create_images (UP)
-- Purpose: Container image catalog with tag tracking and vulnerability scan results

CREATE TYPE scan_status AS ENUM ('pending', 'scanning', 'passed', 'failed', 'error');

-- -------------------------------------------------------------------------
-- images
-- -------------------------------------------------------------------------

CREATE TABLE images (
    id             UUID         NOT NULL DEFAULT uuid_generate_v4(),
    org_id         UUID         NOT NULL,
    name           VARCHAR(512) NOT NULL,    -- repository path, e.g. library/nginx
    tag            VARCHAR(255) NOT NULL DEFAULT 'latest',
    digest         VARCHAR(255),             -- sha256:... content-addressable digest
    size_bytes     BIGINT,
    registry       VARCHAR(512) NOT NULL DEFAULT 'docker.io',
    pull_count     BIGINT       NOT NULL DEFAULT 0,
    last_pulled_at TIMESTAMPTZ,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT images_pkey               PRIMARY KEY (id),
    CONSTRAINT images_org_name_tag_uniq  UNIQUE (org_id, registry, name, tag),
    CONSTRAINT images_org_fk             FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE
);

CREATE INDEX idx_images_org_id  ON images (org_id);
CREATE INDEX idx_images_digest  ON images (digest) WHERE digest IS NOT NULL;
-- Trigram index for image name search
CREATE INDEX idx_images_name_trgm ON images USING GIN (name gin_trgm_ops);

-- -------------------------------------------------------------------------
-- image_tags  (historical tag records; an image can carry multiple tags)
-- -------------------------------------------------------------------------

CREATE TABLE image_tags (
    id         UUID         NOT NULL DEFAULT uuid_generate_v4(),
    image_id   UUID         NOT NULL,
    tag        VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

    CONSTRAINT image_tags_pkey            PRIMARY KEY (id),
    CONSTRAINT image_tags_image_tag_uniq  UNIQUE (image_id, tag),
    CONSTRAINT image_tags_image_fk        FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE
);

CREATE INDEX idx_image_tags_image_id ON image_tags (image_id);

-- -------------------------------------------------------------------------
-- image_scan_results
-- -------------------------------------------------------------------------

CREATE TABLE image_scan_results (
    id              UUID        NOT NULL DEFAULT uuid_generate_v4(),
    image_id        UUID        NOT NULL,
    scanner         VARCHAR(100) NOT NULL,   -- trivy | grype | snyk
    scanned_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    critical_count  INTEGER      NOT NULL DEFAULT 0,
    high_count      INTEGER      NOT NULL DEFAULT 0,
    medium_count    INTEGER      NOT NULL DEFAULT 0,
    low_count       INTEGER      NOT NULL DEFAULT 0,
    status          scan_status  NOT NULL DEFAULT 'pending',
    report          JSONB        NOT NULL DEFAULT '{}',

    CONSTRAINT image_scan_results_pkey     PRIMARY KEY (id),
    CONSTRAINT image_scan_results_image_fk FOREIGN KEY (image_id) REFERENCES images (id) ON DELETE CASCADE,
    CONSTRAINT image_scan_counts_non_neg   CHECK (
        critical_count >= 0 AND high_count >= 0 AND medium_count >= 0 AND low_count >= 0
    )
);

CREATE INDEX idx_image_scan_results_image_id   ON image_scan_results (image_id);
CREATE INDEX idx_image_scan_results_status     ON image_scan_results (status);
CREATE INDEX idx_image_scan_results_critical   ON image_scan_results (image_id, critical_count DESC)
    WHERE critical_count > 0;

COMMENT ON TABLE  images                    IS 'Container image catalog; one row per unique registry+name+tag combination per org.';
COMMENT ON COLUMN images.digest             IS 'OCI content-addressable digest (sha256:...); immutable identifier for a specific image layer set.';
COMMENT ON TABLE  image_tags                IS 'Historical tag assignments; allows tracking mutable tags across digest changes.';
COMMENT ON TABLE  image_scan_results        IS 'Vulnerability scan results per image; multiple scanners can report against the same image.';
COMMENT ON COLUMN image_scan_results.report IS 'Full scanner-native JSON report; schema varies by scanner tool.';
