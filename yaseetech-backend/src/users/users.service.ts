import { HttpStatus, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { DatabaseService } from '../common/database/database.service';
import { AppException } from '../common/exceptions/app.exception';
import { RequestUser } from '../common/guards/request-user.interface';
import { CreateTeamMemberDto } from './dto/create-team-member.dto';

const BCRYPT_COST = 12;

// Roles that operate on one specific branch, per the Phase 1 RBAC matrix --
// Accountant is deliberately absent here, since Accountant is all-branches
// (read) and never takes a branchId.
const BRANCH_SCOPED_ROLES = new Set(['Branch Manager', 'Cashier', 'Staff']);

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
          `SELECT u.id, u.email, u.full_name, u.status, u.created_at,
                  r.name AS role_name, ur.branch_id
           FROM users u
           LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.tenant_id = u.tenant_id
           LEFT JOIN roles r ON r.id = ur.role_id
           ORDER BY u.created_at ASC`,
        );
        return result.rows;
      },
    );
  }

  /**
   * Adds a teammate to the caller's own tenant. This is a deliberately
   * simple v1 flow, not a real "invite" system: there's no email/SMS
   * infrastructure yet (Phase 8), so the Business Owner sets the new
   * teammate's password directly here and shares it with them out of
   * band (verbally, WhatsApp, however). A real invite-link-with-expiry
   * flow is reasonable v2 scope once notification infrastructure exists.
   */
  async createTeamMember(requestUser: RequestUser, dto: CreateTeamMemberDto) {
    if (BRANCH_SCOPED_ROLES.has(dto.role) && !dto.branchId) {
      throw new AppException(
        'BRANCH_REQUIRED_FOR_ROLE',
        `The "${dto.role}" role must be assigned to a specific branch.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const existing = await this.db.findUserForLogin(dto.email);
    if (existing) {
      // Same v1 simplification as registration (migration 015): email is
      // treated as unique platform-wide, not just per-tenant.
      throw new AppException(
        'EMAIL_ALREADY_REGISTERED',
        'An account with this email already exists.',
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_COST);

    return this.db.withTenantContext(
      { tenantId: requestUser.tenantId, userId: requestUser.userId, actorType: 'user' },
      async (client) => {
        if (dto.branchId) {
          const branchCheck = await client.query(`SELECT id FROM branches WHERE id = $1`, [dto.branchId]);
          if (branchCheck.rows.length === 0) {
            throw new AppException(
              'BRANCH_NOT_FOUND',
              'The specified branch does not belong to your business.',
              HttpStatus.BAD_REQUEST,
            );
          }
        }

        const roleResult = await client.query(
          `SELECT id FROM roles WHERE name = $1 AND is_platform_role = false AND tenant_id IS NULL`,
          [dto.role],
        );
        if (roleResult.rows.length === 0) {
          throw new AppException(
            'ROLE_NOT_FOUND',
            `Role "${dto.role}" is not a recognized assignable role.`,
            HttpStatus.BAD_REQUEST,
          );
        }

        const userResult = await client.query(
          `INSERT INTO users (tenant_id, email, phone, password_hash, full_name, status, email_verified_at)
           VALUES ($1, $2, $3, $4, $5, 'active', NULL)
           RETURNING id, email, full_name, status, created_at`,
          [requestUser.tenantId, dto.email, dto.phone ?? null, passwordHash, dto.fullName],
        );
        const newUserId = userResult.rows[0].id as string;

        await client.query(
          `INSERT INTO user_roles (user_id, role_id, tenant_id, branch_id)
           VALUES ($1, $2, $3, $4)`,
          [newUserId, roleResult.rows[0].id, requestUser.tenantId, dto.branchId ?? null],
        );

        return { ...userResult.rows[0], role: dto.role, branchId: dto.branchId ?? null };
      },
    );
  }
}
