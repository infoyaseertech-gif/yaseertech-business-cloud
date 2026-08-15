-- 015_auth_lookup_policy.sql
-- Added while building Phase 3 (auth), because login and registration's
-- duplicate-email check both need to find a user WITHOUT already knowing
-- their tenant_id -- the one legitimate case that breaks the normal
-- "set app.current_tenant_id, then query" pattern.
--
-- Deliberately NOT solved with BYPASSRLS + SECURITY DEFINER: many managed
-- Postgres providers (RDS, Render, Railway, Supabase, etc.) don't grant
-- BYPASSRLS to non-superuser application roles, and relying on it would
-- make this schema non-portable across hosts.
--
-- Instead: a second, SELECT-only permissive policy on `users` that only
-- engages when the server explicitly sets app.auth_lookup = 'true' for
-- that one query. Multiple permissive policies for the same command are
-- combined with OR in PostgreSQL, so this *adds* an allowed path for SELECT
-- without weakening the INSERT/UPDATE/DELETE protection, which still has
-- only the tenant_isolation policy.

CREATE POLICY auth_lookup_select ON users
    FOR SELECT
    USING (current_setting('app.auth_lookup', true) = 'true');

COMMENT ON POLICY auth_lookup_select ON users IS
    'Scoped RLS exception for login/registration email lookup only. The '
    'application sets app.auth_lookup for exactly one query, inside one '
    'transaction, then it goes out of scope. Never derived from anything '
    'client-supplied -- same trust model as app.current_tenant_id.';

-- v1 simplification this implies: email is treated as unique for login
-- purposes across the whole platform, even though the DB constraint is
-- UNIQUE(tenant_id, email), not globally unique. This is enforced at the
-- application layer -- AuthService checks find-by-email before creating a
-- user at registration. A future multi-tenant-membership feature (one
-- person belonging to several businesses) would need a tenant-picker step
-- at login and a revisit of this assumption -- not in v1 scope.
