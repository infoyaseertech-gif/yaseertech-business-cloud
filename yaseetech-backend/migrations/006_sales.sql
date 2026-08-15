-- 006_sales.sql
-- POS sales. client_transaction_uuid is generated on-device at the moment of
-- checkout (works offline) and is the idempotency key for sync -- if the same
-- offline sale is retried against the server, it's a no-op the second time.

CREATE TABLE sales_transactions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id               UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_id             UUID REFERENCES customers(id),
    cashier_user_id         UUID NOT NULL REFERENCES users(id),
    transaction_number      TEXT NOT NULL,           -- human-readable receipt number, sequential per branch
    client_transaction_uuid UUID NOT NULL,            -- generated offline on the POS device
    subtotal_ngn            NUMERIC(12, 2) NOT NULL,
    tax_ngn                 NUMERIC(12, 2) NOT NULL DEFAULT 0,
    discount_ngn            NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_ngn               NUMERIC(12, 2) NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'completed'
                             CHECK (status IN ('completed', 'voided', 'refunded')),
    synced_from_offline     BOOLEAN NOT NULL DEFAULT false,
    occurred_at             TIMESTAMPTZ NOT NULL,     -- the actual time of sale on-device, which may predate created_at (server receipt time) if synced late
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, client_transaction_uuid)
);

CREATE TABLE sales_transaction_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sales_transaction_id UUID NOT NULL REFERENCES sales_transactions(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id),
    quantity            NUMERIC(12, 3) NOT NULL,
    unit_price_ngn      NUMERIC(12, 2) NOT NULL,      -- snapshot of price at time of sale -- never look up current product price for historical receipts
    tax_ngn              NUMERIC(12, 2) NOT NULL DEFAULT 0,
    line_total_ngn       NUMERIC(12, 2) NOT NULL
);

CREATE TABLE sales_payments (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    sales_transaction_id    UUID NOT NULL REFERENCES sales_transactions(id) ON DELETE CASCADE,
    method                  TEXT NOT NULL CHECK (method IN ('cash', 'card', 'transfer')),
    amount_ngn              NUMERIC(12, 2) NOT NULL,
    reference               TEXT,                     -- transfer/card reference, if any
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE sales_payments IS
    'One sales_transaction can have multiple rows here -- this is how split '
    'payments (cash + card + transfer) are represented, per Phase 4.2.';
