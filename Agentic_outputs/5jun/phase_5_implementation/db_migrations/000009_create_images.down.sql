-- Migration: 000009_create_images (DOWN)
-- Purpose: Remove image catalog tables and scan_status enum

DROP INDEX IF EXISTS idx_image_scan_results_critical;
DROP INDEX IF EXISTS idx_image_scan_results_status;
DROP INDEX IF EXISTS idx_image_scan_results_image_id;
DROP TABLE IF EXISTS image_scan_results;

DROP INDEX IF EXISTS idx_image_tags_image_id;
DROP TABLE IF EXISTS image_tags;

DROP INDEX IF EXISTS idx_images_name_trgm;
DROP INDEX IF EXISTS idx_images_digest;
DROP INDEX IF EXISTS idx_images_org_id;
DROP TABLE IF EXISTS images;

DROP TYPE IF EXISTS scan_status;
