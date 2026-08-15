-- 016_accountant_permissions_and_ar_backfill.sql
-- Two gaps found while building Phase 4b (Invoicing):
--
-- 1. The Accountant role (seeded in 014) never had any role_permissions
--    inserted for it -- Business Owner, Branch Manager, and Cashier all
--    got permissions, Accountant was silently skipped. Fixed here per the
--    Phase 1 RBAC matrix: read-only inventory, full accounting, full
--    invoicing. (There's no crm.view permission code yet -- "read-only
--    CRM" from the matrix isn't fully expressible with the current
--    permission set. Noted rather than papered over; crm.manage is
--    intentionally NOT granted here, since that would give Accountant
--    write access the matrix doesn't call for.)
--
-- 2. The demo tenant seeded in 014 (Amaka Foods & Provisions) predates the
--    fix in AuthService.register that now seeds a full chart of accounts
--    including Accounts Receivable -- backfilled here so invoicing works
--    against the demo tenant too.

INSERT INTO role_permissions (role_id, permission_id)
SELECT 'c0000000-0000-0000-0000-000000000012', id
FROM permissions
WHERE code IN ('inventory.view', 'accounting.manage', 'accounting.view', 'invoicing.manage')
ON CONFLICT DO NOTHING;

INSERT INTO accounts (tenant_id, code, name, account_type, is_system_account)
SELECT '10000000-0000-0000-0000-000000000001', '1100', 'Accounts Receivable', 'asset', true
WHERE NOT EXISTS (
    SELECT 1 FROM accounts
    WHERE tenant_id = '10000000-0000-0000-0000-000000000001' AND code = '1100'
);
