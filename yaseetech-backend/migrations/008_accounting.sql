-- 008_accounting.sql
-- Chart of accounts + double-entry journal. Per Phase 0's financial integrity
-- rules: append-only, corrections via reversing entries only. The actual
-- "debits must equal credits" constraint and the append-only lock are enforced
-- by triggers in 010_append_only_enforcement.sql, since PostgreSQL check
-- constraints can't aggregate across sibling rows on their own.

CREATE TABLE accounts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code                TEXT NOT NULL,               -- e.g. '1000', '4000'
    name                TEXT NOT NULL,               -- e.g. 'Cash', 'Sales Revenue'
    account_type        TEXT NOT NULL
                         CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    parent_account_id   UUID REFERENCES accounts(id),
    is_system_account   BOOLEAN NOT NULL DEFAULT false,  -- system accounts (Cash, Sales Revenue, Inventory) are seeded per tenant at onboarding, not user-deletable
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, code)
);

CREATE TABLE journal_entries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    entry_date          DATE NOT NULL,
    description         TEXT NOT NULL,
    source_type         TEXT NOT NULL
                         CHECK (source_type IN ('sale', 'invoice', 'manual', 'reversal')),
    source_id           UUID,                        -- points at sales_transactions.id / invoices.id when auto-generated
    is_reversal         BOOLEAN NOT NULL DEFAULT false,
    reverses_entry_id   UUID REFERENCES journal_entries(id),
    created_by_user_id  UUID REFERENCES users(id),    -- NULL for system-generated entries (from POS/invoice triggers)
    posted_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE journal_entries IS
    'Append-only. A posted entry is never edited or deleted -- see 010_append_only_enforcement.sql. '
    'Corrections are new rows with source_type = reversal, linked via reverses_entry_id.';

CREATE TABLE journal_entry_lines (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    journal_entry_id    UUID NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
    account_id          UUID NOT NULL REFERENCES accounts(id),
    debit_ngn           NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (debit_ngn >= 0),
    credit_ngn          NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (credit_ngn >= 0),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (NOT (debit_ngn > 0 AND credit_ngn > 0))   -- a single line is either a debit or a credit, never both
);
