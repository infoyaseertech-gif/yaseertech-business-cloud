-- 017_billing_phase5.sql
-- Phase 5: Payments & Subscription Billing (Flutterwave).
--
-- Three additions, each mirroring an existing pattern rather than
-- inventing a new one:
--
-- 1. A scoped RLS exception on `payments`, the same shape as
--    015_auth_lookup_policy.sql's `auth_lookup_select` on `users`. The
--    Flutterwave webhook arrives with no JWT and therefore no
--    app.current_tenant_id -- it has to find a payment by
--    flutterwave_tx_ref BEFORE the tenant is known, which is exactly the
--    chicken-and-egg case that policy was built for. Same trust model:
--    the app sets app.billing_webhook_lookup for exactly one SELECT,
--    inside one transaction, never derived from anything client-supplied
--    (the webhook payload's tx_ref is looked up, not trusted for anything
--    beyond that lookup -- see BillingService for the server-to-server
--    verification step that happens before any state changes).
--
-- 2. `tenants.past_due_since`: the sweep job (Phase 5, BillingService)
--    needs to know how long a tenant has been in the 'past_due' grace
--    state to decide when the grace period has run out and
--    'downgraded_readonly' applies. Additive, nullable, backward
--    compatible with every existing row.
--
-- 3. Two new permission codes (billing.manage, billing.view), granted
--    explicitly to the roles that should have them. This repeats
--    016's finding: the "Business Owner gets everything" bulk INSERT in
--    014 only ran once, against the permission set that existed at that
--    time -- any permission added in a later migration needs its own
--    explicit grant, or Business Owner silently doesn't have it. Not
--    re-running the bulk INSERT, since re-running `SELECT * FROM
--    permissions` here would be harmless today but would silently grant
--    Business Owner any permission added between now and whenever this
--    migration runs in a fresh environment -- explicit is safer than
--    implicit for a role grant.

CREATE POLICY billing_webhook_lookup_select ON payments
    FOR SELECT
    USING (current_setting('app.billing_webhook_lookup', true) = 'true');

COMMENT ON POLICY billing_webhook_lookup_select ON payments IS
    'Scoped RLS exception for the Flutterwave webhook''s tx_ref lookup '
    'only. The application sets app.billing_webhook_lookup for exactly '
    'one query, inside one transaction, then it goes out of scope. '
    'Finding a row this way never authorizes writing to it -- the '
    'webhook handler re-enters through withTenantContext, using the '
    'tenant_id this lookup returns, before it changes anything.';

ALTER TABLE tenants ADD COLUMN past_due_since TIMESTAMPTZ;

COMMENT ON COLUMN tenants.past_due_since IS
    'Set when the billing sweep first moves a tenant into ''past_due''. '
    'Cleared back to NULL on a successful payment. The sweep reads this '
    'to decide when the grace period (BillingService.GRACE_PERIOD_DAYS) '
    'has elapsed and ''downgraded_readonly'' applies -- never deleted or '
    'reinterpreted, so a support agent can always see how long a tenant '
    'has actually been unpaid.';

INSERT INTO permissions (id, code, description) VALUES
    ('b0000000-0000-0000-0000-000000000011', 'billing.manage', 'Start a plan upgrade / subscription checkout'),
    ('b0000000-0000-0000-0000-000000000012', 'billing.view',   'View subscription status and payment history');

-- Business Owner: both (owns the money relationship).
INSERT INTO role_permissions (role_id, permission_id) VALUES
    ('c0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000011'),
    ('c0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000012')
ON CONFLICT DO NOTHING;

-- Accountant: view only, per the same reasoning 016 applied to
-- accounting.view -- reconciling payments is bookkeeping, but only the
-- Business Owner should be able to change what the business is paying for.
INSERT INTO role_permissions (role_id, permission_id) VALUES
    ('c0000000-0000-0000-0000-000000000012', 'b0000000-0000-0000-0000-000000000012')
ON CONFLICT DO NOTHING;
