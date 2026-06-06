-- Migration: 000011_create_alert_rules_alerts (DOWN)
-- Purpose: Remove alerting tables and their ENUMs

DROP INDEX IF EXISTS idx_alerts_firing;
DROP INDEX IF EXISTS idx_alerts_status;
DROP INDEX IF EXISTS idx_alerts_container_id;
DROP INDEX IF EXISTS idx_alerts_namespace_id;
DROP INDEX IF EXISTS idx_alerts_rule_id;
DROP TABLE IF EXISTS alerts;

DROP INDEX IF EXISTS idx_alert_rules_severity;
DROP INDEX IF EXISTS idx_alert_rules_enabled;
DROP INDEX IF EXISTS idx_alert_rules_namespace_id;
DROP TABLE IF EXISTS alert_rules;

DROP TYPE IF EXISTS alert_status;
DROP TYPE IF EXISTS alert_severity;
