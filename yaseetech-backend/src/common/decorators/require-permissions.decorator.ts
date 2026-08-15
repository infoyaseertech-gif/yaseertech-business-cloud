import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

// Usage: @RequirePermissions('inventory.manage') above a controller method.
// Read by PermissionsGuard, which must run AFTER JwtAuthGuard in the guard
// chain, since it needs request.user to already be set.
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
