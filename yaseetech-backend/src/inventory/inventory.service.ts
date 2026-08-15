import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database/database.service';
import { RequestUser } from '../common/guards/request-user.interface';
import { AdjustStockDto } from './dto/adjust-stock.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly db: DatabaseService) {}

  async getStock(user: RequestUser, branchId?: string) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const result = await client.query(
          `SELECT s.branch_id, s.product_id, p.sku, p.name, p.unit_of_measure,
                  s.quantity_on_hand, s.reorder_level, s.updated_at
           FROM inventory_stock s
           JOIN products p ON p.id = s.product_id
           WHERE ($1::uuid IS NULL OR s.branch_id = $1)
           ORDER BY p.name ASC`,
          [branchId ?? null],
        );
        return result.rows;
      },
    );
  }

  /**
   * Manual stock adjustment (recount, damage, spoilage, theft write-off).
   * Writes an inventory_movements row (the append-only ledger entry) and
   * upserts the inventory_stock cache in the same transaction.
   *
   * If the adjustment would push stock negative, it's still applied (the
   * physical count IS what it is) but flagged for review -- the same
   * negative-stock handling rule the offline POS sync path uses, per
   * Phase 1, Section 6.3. A manual adjustment pushing stock negative
   * usually means the recorded starting quantity was wrong somewhere
   * upstream, which is exactly the kind of thing a manager should look at,
   * not something the API should silently paper over.
   */
  async adjustStock(user: RequestUser, dto: AdjustStockDto) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId, actorType: 'user' },
      async (client) => {
        const movementResult = await client.query(
          `INSERT INTO inventory_movements
             (tenant_id, branch_id, product_id, movement_type, quantity_delta,
              reason_code, reference_type, performed_by_user_id)
           VALUES ($1, $2, $3, 'adjustment', $4, $5, 'manual', $6)
           RETURNING id, created_at`,
          [
            user.tenantId,
            dto.branchId,
            dto.productId,
            dto.quantityDelta,
            dto.reasonCode,
            user.userId,
          ],
        );

        const stockResult = await client.query(
          `INSERT INTO inventory_stock (tenant_id, branch_id, product_id, quantity_on_hand)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (branch_id, product_id)
           DO UPDATE SET quantity_on_hand = inventory_stock.quantity_on_hand + EXCLUDED.quantity_on_hand,
                         updated_at = now()
           RETURNING quantity_on_hand`,
          [user.tenantId, dto.branchId, dto.productId, dto.quantityDelta],
        );

        const resultingQuantity = Number(stockResult.rows[0].quantity_on_hand);

        if (resultingQuantity < 0) {
          await client.query(
            `UPDATE inventory_movements SET is_conflict_flagged = true WHERE id = $1`,
            [movementResult.rows[0].id],
          );
        }

        return {
          movementId: movementResult.rows[0].id,
          resultingQuantity,
          flaggedForReview: resultingQuantity < 0,
        };
      },
    );
  }
}
