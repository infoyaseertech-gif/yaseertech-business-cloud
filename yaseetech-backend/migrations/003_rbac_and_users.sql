-- 003_rbac_and_users.sql
-- Business profile, branches, users, and the RBAC tables (roles, permissions,
-- role_permissions, user_roles). Matches the permissions matrix drafted in
-- Phase 1, Section 4.2.

CREATE TABLE businesses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    legal_name      TEXT NOT NULL,
    trading_name    TEXT,
    rc_number       TEXT,                       -- CAC registration number, if provided (not required for trial)
    industry        TEXT,
    phone           TEXT,
    email           TEXT,
    address         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE businesses IS
    'Business profile info, separate from tenants (the billing/isolation boundary) '
    'to leave room for a future tenant-to-multiple-businesses model (e.g. Enterprise '
    'holding companies) without a schema rewrite. v1 enforces 1 business per tenant '
    'at the application layer.';

CREATE TABLE branches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    business_id     UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    address         TEXT,
    phone           TEXT,
    is_main_branch  BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- citext gives case-insensitive email comparison/uniqueness without app-layer
-- lower() calls. Must be created before the CREATE TABLE below, which uses it.
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email               CITEXT NOT NULL,
    phone               TEXT,
    password_hash       TEXT NOT NULL,           -- bcrypt/argon2 hash, generated in the app layer -- never plaintext
    full_name           TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active', 'suspended', 'invited')),
    email_verified_at   TIMESTAMPTZ,
    -- Reserved for Phase 1's future-proofing note (Section 4.3): 2FA and SSO,
    -- unused in v1 but present so a later migration doesn't have to touch
    -- every existing row.
    totp_secret         TEXT,
    sso_provider        TEXT,
    sso_subject_id      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, email)
);

CREATE TABLE refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      TEXT NOT NULL,               -- never store the raw token, per Phase 1 Section 4.1
    expires_at      TIMESTAMPTZ NOT NULL,
    revoked_at      TIMESTAMPTZ,
    replaced_by_id  UUID REFERENCES refresh_tokens(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Roles: tenant_id NULL means a platform-level role (Super Admin, Support Agent).
-- A non-null tenant_id would only apply if a tenant needed a fully custom role
-- beyond the standard set below -- not used in v1, reserved for Enterprise tier.
CREATE TABLE roles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    is_platform_role    BOOLEAN NOT NULL DEFAULT false,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT UNIQUE NOT NULL,   -- e.g. 'pos.create_sale', 'accounting.view', 'users.manage'
    description TEXT NOT NULL
);

CREATE TABLE role_permissions (
    role_id         UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id   UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    branch_id   UUID REFERENCES branches(id) ON DELETE CASCADE, -- NULL = applies to all branches (e.g. Business Owner)
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A user can't hold the same role twice for the same branch scope. NULL branch_id
-- (all-branches) and a specific branch_id are treated as distinct scopes, so this
-- is a plain unique index rather than a primary key built from an expression.
CREATE UNIQUE INDEX user_roles_unique_scope
    ON user_roles (user_id, role_id, tenant_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));

COMMENT ON COLUMN user_roles.branch_id IS
    'NULL applies the role across all branches (Business Owner). Non-null scopes '
    'the role to one branch (Branch Manager, Cashier) per Phase 1 permissions matrix.';
