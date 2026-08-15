import { HttpStatus, Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database/database.service';
import { AppException } from '../common/exceptions/app.exception';
import { RequestUser } from '../common/guards/request-user.interface';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async getProfile(requestUser: RequestUser) {
    return this.db.withTenantContext(
      { tenantId: requestUser.tenantId, userId: requestUser.userId },
      async (client) => {
        const userResult = await client.query(
          `SELECT id, email, phone, full_name, status, created_at
           FROM users
           WHERE id = $1`,
          [requestUser.userId],
        );

        if (userResult.rows.length === 0) {
          // Should be unreachable if the JWT was issued correctly, but
          // fail loudly rather than silently rather than return an empty body.
          throw new AppException(
            'USER_NOT_FOUND',
            'Authenticated user could not be found.',
            HttpStatus.NOT_FOUND,
          );
        }

        const rolesResult = await client.query(
          `SELECT r.name, ur.branch_id
           FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
           WHERE ur.user_id = $1 AND ur.tenant_id = $2`,
          [requestUser.userId, requestUser.tenantId],
        );

        return {
          ...userResult.rows[0],
          roles: rolesResult.rows,
        };
      },
    );
  }

  async listTenantUsers(requestUser: RequestUser) {
    return this.db.withTenantContext(
      { tenantId: requestUser.tenantId, userId: requestUser.userId },
      async (client) => {
        const result = await client.query(
          `SELECT id, email, full_name, status, created_at
           FROM users
           ORDER BY created_at ASC`,
        );
        return result.rows;
      },
    );
  }
}
