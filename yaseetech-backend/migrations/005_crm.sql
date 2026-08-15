-- 005_crm.sql

CREATE TABLE customers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    business_id         UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    full_name           TEXT NOT NULL,
    phone               TEXT,
    email               TEXT,
    address             TEXT,
    notes               TEXT,
    -- Denormalized summary fields, maintained by application logic / a scheduled
    -- job rather than a live trigger on every sale, to keep POS checkout writes fast.
    total_spent_ngn      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    last_purchase_at     TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN customers.total_spent_ngn IS
    'Denormalized for fast "top spenders" segmentation queries (Phase 4.3). '
    'Recomputable from sales_transactions at any time -- treat as cache, not source of truth.';
