// What JwtAuthGuard attaches to the request after verifying the token.
// Deliberately minimal -- role/permissions are NOT embedded in the JWT and
// trusted long-term; PermissionsGuard re-checks against the database on
// every request that needs a permission check, so a role change takes
// effect immediately rather than waiting for the token to expire.
export interface RequestUser {
  userId: string;
  tenantId: string;
}
