-- 002_platform_tables.sql
-- Platform-level tables. These are NOT tenant-scoped by definition -- they are
-- the tables that define what a tenant IS and what plan it's on. Row-Level
-- Security is intentionally NOT applied here (see 012_rls_policies.sql for
-- the full list of what does and does not get RLS, and why).

CREATE TABLE subscription_plans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code                TEXT UNIQUE NOT NULL,          -- 'starter' | 'growth' | 'pro' | 'enterprise'
    name                TEXT NOT NULL,
    price_ngn           NUMERIC(12, 2),                 -- NULL for enterprise (custom pricing)
    max_branches        INTEGER,                        -- NULL = unlimited
    max_users           INTEGER,                        -- NULL = unlimited
    features            JSONB NOT NULL DEFAULT '{}',
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE subscription_plans IS
    'Platform-defined plan catalog. Not tenant-scoped. Seeded, not user-created.';

-- The tenant is the top-level tenant-isolation boundary. Every row in every
-- tenant-scoped table below carries a tenant_id that references this table.
CREATE TABLE tenants (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    TEXT NOT NULL,
    slug                    TEXT UNIQUE NOT NULL,       -- used in subdomains / support tooling, never as an auth key
    subscription_plan_id    UUID NOT NULL REFERENCES subscription_plans(id),
    subscription_status     TEXT NOT NULL DEFAULT 'trialing'
                             CHECK (subscription_status IN
                                ('trialing', 'active', 'past_due', 'downgraded_readonly', 'cancelled')),
    trial_ends_at           TIMESTAMPTZ,
    flutterwave_customer_id TEXT,                       -- reference only, never card data (see Phase 5 PCI note)
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE tenants IS
    'The tenant-isolation boundary. tenant_id on every other table refers here.';
COMMENT ON COLUMN tenants.subscription_status IS
    'downgraded_readonly = non-payment grace state per Phase 5: read access retained, write access restricted. Never deleted for non-payment.';
