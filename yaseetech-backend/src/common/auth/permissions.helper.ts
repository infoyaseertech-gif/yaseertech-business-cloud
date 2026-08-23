import { PoolClient } from 'pg';

/**
 * Fetches every permission code the given user actually has, via their
 * role assignments for this tenant. Must be called from inside a
 * withTenantContext transaction (needs a PoolClient with RLS context
 * already set) -- this is a query helper, not a standalone service.
 *
 * Extracted here so PermissionsGuard (write-path enforcement) and
 * DashboardService (read-path visibility) both derive from the exact
 * same source of truth, rather than two separate queries that could
 * quietly drift out of sync over time.
 */
export async function getUserPermissionCodes(
  client: PoolClient,
  userId: string,
  tenantId: string,
): Promise<string[]> {
  const result = await client.query(
    `SELECT DISTINCT p.code
     FROM user_roles ur
     JOIN role_permissions rp ON rp.role_id = ur.role_id
     JOIN permissions p ON p.id = rp.permission_id
     WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
    [userId, tenantId],
  );
  return result.rows.map((r: { code: string }) => r.code);
}
