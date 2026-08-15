import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database/database.service';
import { RequestUser } from '../common/guards/request-user.interface';

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
}
