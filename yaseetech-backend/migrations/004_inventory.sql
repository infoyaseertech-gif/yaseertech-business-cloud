-- 004_inventory.sql
-- Product catalog is business-wide; stock is tracked per branch.
-- inventory_movements is an append-only ledger (deltas), matching the
-- offline-sync conflict design from Phase 1, Section 6.3 -- two devices
-- recording "-1" each while offline compose correctly, since they're both
-- just new rows, not competing overwrites of one number.

CREATE TABLE products (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    sku             TEXT NOT NULL,
    barcode         TEXT,
    name            TEXT NOT NULL,
    category        TEXT,
    cost_price_ngn      NUMERIC(12, 2) NOT NULL DEFAULT 0,
    selling_price_ngn   NUMERIC(12, 2) NOT NULL DEFAULT 0,
    tax_class       TEXT NOT NULL DEFAULT 'standard',  -- rate resolved from a configurable tax-rate table, never hardcoded (Phase 0, 2.3)
    unit_of_measure TEXT NOT NULL DEFAULT 'unit',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, sku)
);

CREATE TABLE inventory_stock (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id           UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id          UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity_on_hand    NUMERIC(12, 3) NOT NULL DEFAULT 0,
    reorder_level       NUMERIC(12, 3) NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (branch_id, product_id)
);

COMMENT ON TABLE inventory_stock IS
    'A cached current-quantity snapshot for fast reads (POS needs this instantly). '
    'The source of truth for how it got there is inventory_movements below -- '
    'this table is derived/reconciled from movements, never edited directly by hand.';

CREATE TABLE inventory_movements (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id               UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    product_id              UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type           TEXT NOT NULL
                             CHECK (movement_type IN
                                ('sale', 'purchase', 'adjustment', 'transfer_in', 'transfer_out', 'return')),
    quantity_delta          NUMERIC(12, 3) NOT NULL,     -- negative for sale/transfer_out, positive for purchase/return/transfer_in
    reason_code             TEXT,                        -- required for 'adjustment' at the application layer
    reference_type          TEXT,                        -- 'sales_transaction' | 'invoice' | 'manual' | 'sync_conflict'
    reference_id            UUID,
    performed_by_user_id    UUID REFERENCES users(id),
    client_movement_uuid    UUID,                        -- set by the offline POS client; used for sync idempotency
    is_conflict_flagged     BOOLEAN NOT NULL DEFAULT false,
    conflict_resolved_at    TIMESTAMPTZ,
    conflict_resolved_by    UUID REFERENCES users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE inventory_movements IS
    'Append-only ledger. Never UPDATE the quantity_delta of a posted row -- '
    'correct with a new offsetting movement. Enforced by trigger in 010_append_only_enforcement.sql.';
COMMENT ON COLUMN inventory_movements.is_conflict_flagged IS
    'Set true when a sync would push inventory_stock negative. Routed to the '
    'manager review queue per Phase 1, Section 6.3 -- never silently corrected.';

-- Prevents duplicate processing if the same offline movement is synced twice
-- (flaky connection retries the same request).
CREATE UNIQUE INDEX inventory_movements_client_uuid_unique
    ON inventory_movements (tenant_id, client_movement_uuid)
    WHERE client_movement_uuid IS NOT NULL;
