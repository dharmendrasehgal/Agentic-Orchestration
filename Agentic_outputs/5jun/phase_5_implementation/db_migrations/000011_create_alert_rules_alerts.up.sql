-- Migration: 000011_create_alert_rules_alerts (UP)
-- Purpose: Alerting subsystem — rule definitions and fired alert instances

CREATE TYPE alert_severity AS ENUM ('critical', 'high', 'warning', 'info');
CREATE TYPE alert_status   AS ENUM ('firing', 'resolved', 'acknowledged', 'silenced');

-- -------------------------------------------------------------------------
-- alert_rules
-- -------------------------------------------------------------------------

CREATE TABLE alert_rules (
    id             UUID           NOT NULL DEFAULT uuid_generate_v4(),
    namespace_id   UUID           NOT NULL,
    name           VARCHAR(255)   NOT NULL,
    description    TEXT,
    metric_query   TEXT           NOT NULL,   -- PromQL / metric expression
    condition      VARCHAR(10)    NOT NULL,   -- gt | lt | eq | gte | lte
    threshold      NUMERIC(20, 4) NOT NULL,
    severity       alert_severity NOT NULL DEFAULT 'warning',
    for_duration   INTERVAL       NOT NULL DEFAULT INTERVAL '1 minute',  -- must stay above threshold for this long
    enabled        BOOLEAN        NOT NULL DEFAULT TRUE,
    labels         JSONB          NOT NULL DEFAULT '{}',
    annotations    JSONB          NOT NULL DEFAULT '{}',
    created_by     UUID           NOT NULL,
    created_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ    NOT NULL DEFAULT NOW(),

    CONSTRAINT alert_rules_pkey        PRIMARY KEY (id),
    CONSTRAINT alert_rules_ns_name_uniq UNIQUE (namespace_id, name),
    CONSTRAINT alert_rules_ns_fk       FOREIGN KEY (namespace_id) REFERENCES namespaces (id) ON DELETE CASCADE,
    CONSTRAINT alert_rules_creator_fk  FOREIGN KEY (created_by)   REFERENCES users (id)      ON DELETE RESTRICT,
    CONSTRAINT alert_rules_condition   CHECK (condition IN ('gt', 'lt', 'eq', 'gte', 'lte'))
);

CREATE INDEX idx_alert_rules_namespace_id ON alert_rules (namespace_id);
CREATE INDEX idx_alert_rules_enabled      ON alert_rules (namespace_id) WHERE enabled = TRUE;
CREATE INDEX idx_alert_rules_severity     ON alert_rules (severity);

-- -------------------------------------------------------------------------
-- alerts
-- -------------------------------------------------------------------------

CREATE TABLE alerts (
    id                UUID         NOT NULL DEFAULT uuid_generate_v4(),
    rule_id           UUID         NOT NULL,
    namespace_id      UUID         NOT NULL,
    container_id      UUID,                    -- nullable: some alerts are host/cluster-level
    status            alert_status NOT NULL DEFAULT 'firing',
    fired_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    resolved_at       TIMESTAMPTZ,
    acknowledged_by   UUID,                    -- FK to users; nullable
    acknowledged_at   TIMESTAMPTZ,
    message           TEXT         NOT NULL DEFAULT '',
    value             NUMERIC(20, 4),          -- metric value that triggered the alert
    labels            JSONB        NOT NULL DEFAULT '{}',

    CONSTRAINT alerts_pkey            PRIMARY KEY (id),
    CONSTRAINT alerts_rule_fk         FOREIGN KEY (rule_id)         REFERENCES alert_rules (id)  ON DELETE CASCADE,
    CONSTRAINT alerts_namespace_fk    FOREIGN KEY (namespace_id)    REFERENCES namespaces (id)   ON DELETE CASCADE,
    CONSTRAINT alerts_container_fk    FOREIGN KEY (container_id)    REFERENCES containers (id)   ON DELETE SET NULL,
    CONSTRAINT alerts_ack_user_fk     FOREIGN KEY (acknowledged_by) REFERENCES users (id)        ON DELETE SET NULL,
    CONSTRAINT alerts_resolved_after_fired CHECK (resolved_at IS NULL OR resolved_at >= fired_at)
);

CREATE INDEX idx_alerts_rule_id         ON alerts (rule_id);
CREATE INDEX idx_alerts_namespace_id    ON alerts (namespace_id);
CREATE INDEX idx_alerts_container_id    ON alerts (container_id) WHERE container_id IS NOT NULL;
CREATE INDEX idx_alerts_status          ON alerts (status, fired_at DESC);
CREATE INDEX idx_alerts_firing          ON alerts (namespace_id, fired_at DESC) WHERE status = 'firing';

COMMENT ON TABLE  alert_rules               IS 'Metric threshold rules that the alerting engine evaluates periodically.';
COMMENT ON COLUMN alert_rules.metric_query  IS 'Prometheus-compatible query expression; evaluated by the metrics collector.';
COMMENT ON COLUMN alert_rules.for_duration  IS 'Minimum continuous breach duration before an alert is fired.';
COMMENT ON TABLE  alerts                    IS 'Individual alert instances produced when a rule threshold is breached.';
COMMENT ON COLUMN alerts.container_id       IS 'NULL for cluster-level or host-level alerts; set for container-scoped alerts.';
