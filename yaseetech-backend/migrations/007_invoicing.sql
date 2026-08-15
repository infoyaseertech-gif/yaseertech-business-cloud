-- 007_invoicing.sql

CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    customer_id         UUID NOT NULL REFERENCES customers(id),
    invoice_number      TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft'
                         CHECK (status IN ('draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled')),
    issue_date          DATE NOT NULL,
    due_date            DATE NOT NULL,
    subtotal_ngn        NUMERIC(12, 2) NOT NULL,
    tax_ngn             NUMERIC(12, 2) NOT NULL DEFAULT 0,
    total_ngn           NUMERIC(12, 2) NOT NULL,
    amount_paid_ngn     NUMERIC(12, 2) NOT NULL DEFAULT 0,
    is_recurring        BOOLEAN NOT NULL DEFAULT false,
    recurrence_rule     TEXT,                     -- e.g. 'monthly', 'weekly' -- interpreted by the background job that generates recurring invoices
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, invoice_number)
);

CREATE TABLE invoice_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    product_id      UUID REFERENCES products(id),    -- nullable: invoices can bill for services/line items not in the product catalog
    description     TEXT NOT NULL,
    quantity        NUMERIC(12, 3) NOT NULL,
    unit_price_ngn  NUMERIC(12, 2) NOT NULL,
    line_total_ngn  NUMERIC(12, 2) NOT NULL
);

CREATE TABLE invoice_payments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount_ngn      NUMERIC(12, 2) NOT NULL,
    paid_at         TIMESTAMPTZ NOT NULL,
    method          TEXT,
    reference       TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE invoice_payments IS
    'Supports partial payments against an invoice -- status transitions to '
    'partially_paid / paid based on SUM(amount_ngn) vs total_ngn, computed in the app layer.';
