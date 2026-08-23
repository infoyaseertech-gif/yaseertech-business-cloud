import { HttpStatus, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../common/database/database.service';
import { AppException } from '../common/exceptions/app.exception';
import { RequestUser } from '../common/guards/request-user.interface';
import { CreateProductDto } from './dto/create-product.dto';
import { ImportCommitDto, ImportPreviewDto } from './dto/import-products.dto';
import { parseAndValidateImportCsv } from './products-import.helper';

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

  /**
   * Validates a CSV against the current catalog and reports what would
   * happen -- writes nothing. This is the mandatory preview step Phase 0's
   * risk register called for: a bulk import should never silently merge
   * bad data into an existing catalog.
   */
  async importPreview(user: RequestUser, dto: ImportPreviewDto) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const existingSkus = await this.getExistingSkusLowercase(client);
        const result = parseAndValidateImportCsv(dto.csvContent, existingSkus);
        return {
          totalRows: result.validRows.length + result.invalidRows.length,
          validCount: result.validRows.length,
          invalidCount: result.invalidRows.length,
          validRows: result.validRows,
          invalidRows: result.invalidRows,
          duplicateSkusInFile: result.duplicateSkusInFile,
          duplicateSkusInDb: result.duplicateSkusInDb,
        };
      },
    );
  }

  /**
   * Re-validates the same CSV from scratch (never trusts that whatever the
   * client previewed is still accurate -- the catalog could have changed
   * in between, e.g. someone else on the team adding a product with the
   * same SKU) and imports only the rows that pass. Invalid rows are
   * skipped, not rejected wholesale -- a bulk import with 3 bad rows out
   * of 200 shouldn't block the other 197 from going in.
   */
  async importCommit(user: RequestUser, dto: ImportCommitDto) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId, actorType: 'user' },
      async (client) => {
        const branchCheck = await client.query(`SELECT id FROM branches WHERE id = $1`, [dto.branchId]);
        if (branchCheck.rows.length === 0) {
          throw new AppException(
            'BRANCH_NOT_FOUND',
            'The specified branch does not belong to your business.',
            HttpStatus.BAD_REQUEST,
          );
        }

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

        const existingSkus = await this.getExistingSkusLowercase(client);
        const { validRows, invalidRows } = parseAndValidateImportCsv(dto.csvContent, existingSkus);

        let imported = 0;
        for (const row of validRows) {
          const productResult = await client.query(
            `INSERT INTO products
               (tenant_id, business_id, sku, barcode, name, category,
                cost_price_ngn, selling_price_ngn, unit_of_measure)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id`,
            [
              user.tenantId,
              businessId,
              row.sku,
              row.barcode,
              row.name,
              row.category,
              row.costPriceNgn,
              row.sellingPriceNgn,
              row.unitOfMeasure,
            ],
          );
          const productId = productResult.rows[0].id as string;
          imported += 1;

          if (row.initialQuantity > 0) {
            await client.query(
              `INSERT INTO inventory_stock (tenant_id, branch_id, product_id, quantity_on_hand)
               VALUES ($1, $2, $3, $4)`,
              [user.tenantId, dto.branchId, productId, row.initialQuantity],
            );
            // Recorded as an 'adjustment' movement (append-only ledger, per
            // migration 004/010) rather than inventing a new movement_type
            // -- the CHECK constraint on movement_type doesn't include an
            // "initial stock" value, and adding one would need its own
            // migration for a case that's really just "stock appeared from
            // a source outside a sale/purchase/transfer," which adjustment
            // already covers.
            await client.query(
              `INSERT INTO inventory_movements
                 (tenant_id, branch_id, product_id, movement_type, quantity_delta,
                  reason_code, reference_type, performed_by_user_id)
               VALUES ($1, $2, $3, 'adjustment', $4, 'bulk_import', 'manual', $5)`,
              [user.tenantId, dto.branchId, productId, row.initialQuantity, user.userId],
            );
          }
        }

        return {
          imported,
          skipped: invalidRows.length,
          skippedDetails: invalidRows,
        };
      },
    );
  }

  private async getExistingSkusLowercase(client: PoolClient): Promise<Set<string>> {
    const result = await client.query(`SELECT sku FROM products`);
    return new Set(result.rows.map((r: { sku: string }) => r.sku.toLowerCase()));
  }
}
