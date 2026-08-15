import { HttpStatus, Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database/database.service';
import { AppException } from '../common/exceptions/app.exception';
import { RequestUser } from '../common/guards/request-user.interface';
import { CreateProductDto } from './dto/create-product.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: RequestUser) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const result = await client.query(
          `SELECT id, sku, barcode, name, category, cost_price_ngn,
                  selling_price_ngn, unit_of_measure, is_active, created_at
           FROM products
           WHERE is_active = true
           ORDER BY name ASC`,
        );
        return result.rows;
      },
    );
  }

  async getOne(user: RequestUser, productId: string) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const result = await client.query(
          `SELECT id, sku, barcode, name, category, cost_price_ngn,
                  selling_price_ngn, unit_of_measure, is_active, created_at
           FROM products
           WHERE id = $1`,
          [productId],
        );
        if (result.rows.length === 0) {
          throw new AppException(
            'PRODUCT_NOT_FOUND',
            'Product not found.',
            HttpStatus.NOT_FOUND,
          );
        }
        return result.rows[0];
      },
    );
  }

  async create(user: RequestUser, dto: CreateProductDto) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId, actorType: 'user' },
      async (client) => {
        // v1 assumes exactly one business per tenant (Phase 2 schema note).
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
        const businessId = businessResult.rows[0].id as string;

        const existing = await client.query(
          `SELECT id FROM products WHERE sku = $1`,
          [dto.sku],
        );
        if (existing.rows.length > 0) {
          throw new AppException(
            'SKU_ALREADY_EXISTS',
            `A product with SKU "${dto.sku}" already exists.`,
            HttpStatus.CONFLICT,
          );
        }

        const result = await client.query(
          `INSERT INTO products
             (tenant_id, business_id, sku, barcode, name, category,
              cost_price_ngn, selling_price_ngn, unit_of_measure)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, sku, barcode, name, category, cost_price_ngn,
                     selling_price_ngn, unit_of_measure, is_active, created_at`,
          [
            user.tenantId,
            businessId,
            dto.sku,
            dto.barcode ?? null,
            dto.name,
            dto.category ?? null,
            dto.costPriceNgn,
            dto.sellingPriceNgn,
            dto.unitOfMeasure ?? 'unit',
          ],
        );

        return result.rows[0];
      },
    );
  }
}
