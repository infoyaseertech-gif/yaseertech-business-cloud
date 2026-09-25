-- 018_rls_placeholder_guc_fix.sql
-- Fixes a latent bug in every tenant_isolation policy from
-- 012_rls_policies.sql, surfaced while building Phase 5's webhook lookup
-- (findPaymentForWebhook) -- but pre-existing, and not specific to
-- billing. Root cause, confirmed directly against Postgres 16:
--
--   current_setting('app.current_tenant_id', true) returns NULL the
--   FIRST time it is ever read on a given physical backend connection.
--   But once ANY transaction on that same connection does
--   `SET LOCAL app.current_tenant_id = '<uuid>'` and commits, Postgres
--   creates a permanent placeholder GUC entry for that name on the
--   connection. From then on, for the lifetime of that physical
--   connection, an unset SET LOCAL reverts to the placeholder's boot
--   value -- empty string '' -- NOT back to NULL.
--
-- 012's comment says "If it's unset, current_setting(..., true) returns
-- NULL" -- true only the very first time. Every application pool reuses
-- physical connections across requests (pg's default pool size is more
-- than 1, and even a pool of 1 reuses the same connection across serial
-- requests). So: tenant request A sets current_tenant_id and commits: on
-- THAT connection its cast is now permanently `''::uuid` shaped whenever
-- a later query on the SAME connection doesn't set it again -- which is
-- exactly what happens on any query path that deliberately doesn't know
-- the tenant yet (findUserForLogin's auth_lookup_select policy runs
-- alongside this same tenant_isolation policy as a second permissive
-- policy on `users`; findPaymentForWebhook is the same shape on
-- `payments`). '' :: uuid is not a valid cast and raises a hard
-- PostgreSQL error (22P02) instead of the intended "zero rows, deny by
-- default" -- confirmed with a minimal repro: five SET LOCAL+COMMIT
-- cycles on one connection, then one query on that same connection with
-- no SET LOCAL, throws `invalid input syntax for type uuid: ""`.
--
-- Fix: NULLIF collapses '' back to NULL before the cast, on every read,
-- regardless of connection history. NULL = anything is still NULL
-- (falsy) -- deny-by-default is unchanged, this only removes the crash.
-- Applied to every table 012 touched, plus the roles special case, so
-- the whole surface gets the same guarantee rather than patching only
-- the table that happened to surface it first.

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
        EXECUTE format('DROP POLICY tenant_isolation ON %I;', t);
        EXECUTE format(
            'CREATE POLICY tenant_isolation ON %I USING (tenant_id = NULLIF(current_setting(''app.current_tenant_id'', true), '''')::uuid);',
            t
        );
    END LOOP;
END $$;

DROP POLICY tenant_isolation_roles ON roles;

CREATE POLICY tenant_isolation_roles ON roles
    USING (
        tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid
        OR tenant_id IS NULL
    );
