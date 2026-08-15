import {
  CanActivate,
  ExecutionContext,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { AppException } from '../exceptions/app.exception';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { RequestUser } from './request-user.interface';

/**
 * The runtime implementation of the RBAC matrix from Phase 1, Section 4.2.
 *
 * Deliberately re-checks the database on every request rather than trusting
 * a role embedded in the JWT -- a permission change (role reassignment,
 * account suspension) takes effect on the caller's very next request,
 * instead of waiting up to 15 minutes for their access token to expire.
 * The cost is one extra query per protected request; that's an acceptable
 * trade for v1, and worth revisiting only if it shows up in Phase 8 load
 * testing as an actual bottleneck (a per-user permission cache in Redis
 * would be the fix, invalidated on role change).
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly db: DatabaseService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // endpoint didn't declare @RequirePermissions -- nothing to check
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { user: RequestUser }>();
    const { userId, tenantId } = request.user;

    const granted = await this.db.withTenantContext(
      { tenantId, userId, actorType: 'user' },
      async (client) => {
        const result = await client.query(
          `SELECT DISTINCT p.code
           FROM user_roles ur
           JOIN role_permissions rp ON rp.role_id = ur.role_id
           JOIN permissions p ON p.id = rp.permission_id
           WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
          [userId, tenantId],
        );
        return result.rows.map((r: { code: string }) => r.code);
      },
    );

    const hasAll = requiredPermissions.every((p) => granted.includes(p));
    if (!hasAll) {
      throw new AppException(
        'FORBIDDEN_MISSING_PERMISSION',
        'You do not have permission to perform this action.',
        HttpStatus.FORBIDDEN,
        { required: requiredPermissions },
      );
    }

    return true;
  }
}
