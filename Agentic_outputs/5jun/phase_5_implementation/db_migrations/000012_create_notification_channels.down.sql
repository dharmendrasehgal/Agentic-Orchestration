-- Migration: 000012_create_notification_channels (DOWN)
-- Purpose: Remove notification tables and channel type enum

DROP INDEX IF EXISTS idx_notification_subscriptions_rule_id;
DROP INDEX IF EXISTS idx_notification_subscriptions_channel_id;
DROP TABLE IF EXISTS notification_subscriptions;

DROP INDEX IF EXISTS idx_notification_channels_enabled;
DROP INDEX IF EXISTS idx_notification_channels_org_id;
DROP TABLE IF EXISTS notification_channels;

DROP TYPE IF EXISTS notification_channel_type;
