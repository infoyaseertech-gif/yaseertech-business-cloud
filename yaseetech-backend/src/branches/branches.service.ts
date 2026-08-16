import { HttpStatus, Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database/database.service';
import { AppException } from '../common/exceptions/app.exception';
import { RequestUser } from '../common/guards/request-user.interface';
import { CreateBranchDto } from './dto/create-branch.dto';

@Injectable()
export class BranchesService {
  constructor(private readonly db: DatabaseService) {}

  async listForTenant(user: RequestUser) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const result = await client.query(
          `SELECT id, name, address, is_main_branch
           FROM branches
           ORDER BY is_main_branch DESC, name ASC`,
        );
        return result.rows;
      },
    );
  }

  async create(user: RequestUser, dto: CreateBranchDto) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId, actorType: 'user' },
      async (client) => {
        const businessResult = await client.query(
          `SELECT id FROM businesses ORDER BY created_at ASC LIMIT 1`,
        );
        if (businessResult.rows.length === 0) {
          throw new AppException(
            'BUSINESS_NOT_FOUND',
            'No business is set up for this account yet.',
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }

        const result = await client.query(
          // is_main_branch is always false here -- the main branch is only
          // ever set once, at registration time (AuthService.register).
          `INSERT INTO branches (tenant_id, business_id, name, address, phone, is_main_branch)
           VALUES ($1, $2, $3, $4, $5, false)
           RETURNING id, name, address, is_main_branch`,
          [user.tenantId, businessResult.rows[0].id, dto.name, dto.address ?? null, dto.phone ?? null],
        );
        return result.rows[0];
      },
    );
  }
}
