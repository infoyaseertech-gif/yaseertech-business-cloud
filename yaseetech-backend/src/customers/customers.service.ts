import { HttpStatus, Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database/database.service';
import { AppException } from '../common/exceptions/app.exception';
import { RequestUser } from '../common/guards/request-user.interface';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: RequestUser) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const result = await client.query(
          `SELECT id, full_name, phone, email, total_spent_ngn, last_purchase_at, created_at
           FROM customers
           ORDER BY full_name ASC`,
        );
        return result.rows;
      },
    );
  }

  async create(user: RequestUser, dto: CreateCustomerDto) {
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
          `INSERT INTO customers (tenant_id, business_id, full_name, phone, email, address)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, full_name, phone, email, total_spent_ngn, last_purchase_at, created_at`,
          [
            user.tenantId,
            businessResult.rows[0].id,
            dto.fullName,
            dto.phone ?? null,
            dto.email ?? null,
            dto.address ?? null,
          ],
        );
        return result.rows[0];
      },
    );
  }
}
