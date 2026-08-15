-- 013_indexes.sql
-- Per Phase 2 spec: composite (tenant_id, created_at) on every high-volume
-- table, since nearly every query filters by tenant first; index foreign
-- keys; avoid over-indexing write-heavy POS tables.

-- High-volume, time-ordered tables: composite (tenant_id, created_at) is the
-- workhorse index for "this tenant's recent X" queries and for the future
-- partitioning-by-tenant-or-month decision (Phase 2 deliverable doc).
CREATE INDEX idx_sales_transactions_tenant_created
    ON sales_transactions (tenant_id, created_at DESC);

CREATE INDEX idx_inventory_movements_tenant_created
    ON inventory_movements (tenant_id, created_at DESC);

CREATE INDEX idx_audit_logs_tenant_created
    ON audit_logs (tenant_id, created_at DESC);

CREATE INDEX idx_journal_entries_tenant_date
    ON journal_entries (tenant_id, entry_date DESC);

CREATE INDEX idx_payments_tenant_created
    ON payments (tenant_id, created_at DESC);

-- Deliberately NOT indexed beyond the primary key + the tenant_created index
-- above: sales_transaction_items, journal_entry_lines. These are the
-- highest-write-volume child tables (one write per line item, every sale);
-- extra indexes here would slow down POS checkout writes for read patterns
-- that don't exist yet. Add only when a specific slow query justifies it.

-- Foreign-key lookups that are NOT already covered by a UNIQUE constraint
-- (unique constraints already create an index; these are the remaining FKs).
CREATE INDEX idx_branches_business_id ON branches (business_id);
CREATE INDEX idx_products_business_id ON products (business_id);
CREATE INDEX idx_inventory_stock_product_id ON inventory_stock (product_id);
CREATE INDEX idx_sales_transaction_items_transaction_id ON sales_transaction_items (sales_transaction_id);
CREATE INDEX idx_sales_transaction_items_product_id ON sales_transaction_items (product_id);
CREATE INDEX idx_sales_payments_transaction_id ON sales_payments (sales_transaction_id);
CREATE INDEX idx_invoice_items_invoice_id ON invoice_items (invoice_id);
CREATE INDEX idx_invoice_payments_invoice_id ON invoice_payments (invoice_id);
CREATE INDEX idx_journal_entry_lines_entry_id ON journal_entry_lines (journal_entry_id);
CREATE INDEX idx_journal_entry_lines_account_id ON journal_entry_lines (account_id);
CREATE INDEX idx_customers_business_id ON customers (business_id);
CREATE INDEX idx_user_roles_user_id ON user_roles (user_id);

-- Common lookup patterns beyond raw FK indexes:
CREATE INDEX idx_customers_tenant_phone ON customers (tenant_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_products_tenant_barcode ON products (tenant_id, barcode) WHERE barcode IS NOT NULL;
CREATE INDEX idx_invoices_tenant_status_due ON invoices (tenant_id, status, due_date)
    WHERE status IN ('sent', 'partially_paid', 'overdue');  -- powers the "overdue invoices" dashboard query directly

COMMENT ON INDEX idx_invoices_tenant_status_due IS
    'Partial index -- only rows relevant to the overdue/outstanding dashboard '
    'view are indexed, keeping the index small as paid/draft invoices accumulate.';
