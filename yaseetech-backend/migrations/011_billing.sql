-- 011_billing.sql
-- Subscriptions and payments. Flutterwave webhook is the source of truth
-- for payment status per Phase 5 -- raw_webhook_payload is stored for
-- reconciliation/debugging, never parsed and discarded.

CREATE TABLE subscriptions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan_id                     UUID NOT NULL REFERENCES subscription_plans(id),
    status                      TEXT NOT NULL
                                 CHECK (status IN ('trialing', 'active', 'past_due', 'downgraded_readonly', 'cancelled')),
    trial_ends_at                TIMESTAMPTZ,
    current_period_start         TIMESTAMPTZ,
    current_period_end           TIMESTAMPTZ,
    flutterwave_subaccount_id    TEXT,       -- reference only -- resolved in Phase 5's payment-facilitator-vs-subaccount decision (Phase 0, 2.2)
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id         UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    amount_ngn              NUMERIC(12, 2) NOT NULL,
    currency                TEXT NOT NULL DEFAULT 'NGN',
    flutterwave_tx_ref      TEXT NOT NULL,       -- our reference, sent to Flutterwave
    flutterwave_tx_id       TEXT,                -- Flutterwave's own transaction ID, populated on confirmation
    status                  TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'successful', 'failed', 'reversed')),
    paid_at                 TIMESTAMPTZ,
    raw_webhook_payload     JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, flutterwave_tx_ref)
);

COMMENT ON COLUMN payments.flutterwave_tx_ref IS
    'The idempotency anchor for webhook processing -- a duplicate webhook '
    'delivery for the same tx_ref is a no-op, per Phase 5 idempotent handling.';

-- payments is the last of the three tables Phase 2 flags as sensitive for
-- audit logging (users, journal entries already wired in 009_audit_log.sql).
CREATE TRIGGER trg_audit_payments
    AFTER INSERT OR UPDATE OR DELETE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_audit_log_row();
