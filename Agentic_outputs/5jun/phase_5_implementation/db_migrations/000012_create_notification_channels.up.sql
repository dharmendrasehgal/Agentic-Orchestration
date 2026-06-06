-- Migration: 000012_create_notification_channels (UP)
-- Purpose: Notification delivery channels and their subscriptions to alert rules

CREATE TYPE notification_channel_type AS ENUM ('slack', 'email', 'webhook', 'pagerduty', 'teams', 'opsgenie');

-- -------------------------------------------------------------------------
-- notification_channels
-- -------------------------------------------------------------------------

CREATE TABLE notification_channels (
    id          UUID                     NOT NULL DEFAULT uuid_generate_v4(),
    org_id      UUID                     NOT NULL,
    name        VARCHAR(255)             NOT NULL,
    type        notification_channel_type NOT NULL,
    -- config stored encrypted; application calls pgp_sym_encrypt(config::text, key)
    -- and stores the ciphertext here; decrypted on read with pgp_sym_decrypt
    config      BYTEA                    NOT NULL,  -- encrypted JSONB payload
    enabled     BOOLEAN                  NOT NULL DEFAULT TRUE,
    created_by  UUID,
    created_at  TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ              NOT NULL DEFAULT NOW(),

    CONSTRAINT notification_channels_pkey          PRIMARY KEY (id),
    CONSTRAINT notification_channels_org_name_uniq UNIQUE (org_id, name),
    CONSTRAINT notification_channels_org_fk        FOREIGN KEY (org_id)     REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT notification_channels_creator_fk    FOREIGN KEY (created_by) REFERENCES users (id)         ON DELETE SET NULL
);

CREATE INDEX idx_notification_channels_org_id  ON notification_channels (org_id);
CREATE INDEX idx_notification_channels_enabled ON notification_channels (org_id) WHERE enabled = TRUE;

-- -------------------------------------------------------------------------
-- notification_subscriptions
-- -------------------------------------------------------------------------

CREATE TABLE notification_subscriptions (
    id          UUID        NOT NULL DEFAULT uuid_generate_v4(),
    channel_id  UUID        NOT NULL,
    rule_id     UUID        NOT NULL,
    -- optional severity filter: NULL means subscribe to all severities
    min_severity alert_severity,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT notification_subscriptions_pkey         PRIMARY KEY (id),
    CONSTRAINT notification_subscriptions_ch_rule_uniq UNIQUE (channel_id, rule_id),
    CONSTRAINT notification_subscriptions_channel_fk   FOREIGN KEY (channel_id) REFERENCES notification_channels (id) ON DELETE CASCADE,
    CONSTRAINT notification_subscriptions_rule_fk      FOREIGN KEY (rule_id)    REFERENCES alert_rules (id)           ON DELETE CASCADE
);

CREATE INDEX idx_notification_subscriptions_channel_id ON notification_subscriptions (channel_id);
CREATE INDEX idx_notification_subscriptions_rule_id    ON notification_subscriptions (rule_id);

COMMENT ON TABLE  notification_channels        IS 'Outbound notification delivery targets; config is always stored encrypted.';
COMMENT ON COLUMN notification_channels.config IS 'pgcrypto pgp_sym_encrypt ciphertext of the channel-specific config JSON (webhook URL, Slack token, etc.).';
COMMENT ON TABLE  notification_subscriptions   IS 'Maps alert rules to notification channels; determines who gets notified when a rule fires.';
