-- 012_rls_policies.sql
-- Row-Level Security: the database-level backstop for tenant isolation
-- required by Phase 0 and specified in Phase 1, Section 2.
--
-- Pattern for every tenant-scoped table:
--   ALTER TABLE x ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE x FORCE ROW LEVEL SECURITY;   -- applies even to the table owner
--   CREATE POLICY tenant_isolation ON x
--     USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
--
-- app.current_tenant_id is set exactly once per request by app-server
-- middleware, immediately after JWT verification (Phase 1, Section 2.3).
-- If it's unset, current_setting(..., true) returns NULL, and
-- tenant_id = NULL is false for every row -- the default is deny, not allow.
--
-- The application's database role does NOT have BYPASSRLS. Only a separate,
-- tightly-controlled migration/support role does, and every query it runs
-- against tenant data is expected to go through the audited "view as tenant"
-- code path (Phase 0/11), not ad hoc access.

DO $$
DECLARE
    t TEXT;
BEGIN
    FOR t IN SELECT unnest(ARRAY[
        'businesses', 'branches', 'users', 'refresh_tokens', 'user_roles',
        'products', 'inventory_stock', 'inventory_movements',
        'customers',
        'sales_transactions', 'sales_transaction_items', 'sales_payments',
        'invoices', 'invoice_items', 'invoice_payments',
        'accounts', 'journal_entries', 'journal_entry_lines',
        'subscriptions', 'payments',
        'audit_logs'
    ])
    LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = current_setting(''app.current_tenant_id'', true)::uuid);',
            t
        );
    END LOOP;
END $$;

-- roles is a special case: tenant_id is NULL for platform-level roles
-- (Super Admin, Support Agent), which every tenant context needs to be able
-- to read (e.g. to resolve a user's assigned role), but never write.
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_roles ON roles
    USING (
        tenant_id = current_setting('app.current_tenant_id', true)::uuid
        OR tenant_id IS NULL
    );

-- NOT RLS-protected, deliberately:
--   tenants, subscription_plans  -- platform-level, no tenant_id column at all
--   permissions, role_permissions -- global lookup tables, no tenant_id column
--
-- These are documented here (rather than left silent) so a future reviewer
-- doesn't mistake the absence of RLS for an oversight.
