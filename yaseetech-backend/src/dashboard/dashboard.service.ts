import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../common/database/database.service';
import { RequestUser } from '../common/guards/request-user.interface';
import { getUserPermissionCodes } from '../common/auth/permissions.helper';

export interface DashboardSummary {
  todaySales: { total: number; count: number } | null;
  lowStock: {
    items: {
      productId: string;
      productName: string;
      branchId: string;
      branchName: string;
      quantityOnHand: number;
      reorderLevel: number;
    }[];
  } | null;
  outstandingInvoices: { count: number; total: number; overdueCount: number } | null;
  teamSize: number | null;
}

@Injectable()
export class DashboardService {
  constructor(private readonly db: DatabaseService) {}

  async getSummary(user: RequestUser, branchId?: string): Promise<DashboardSummary> {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const permissions = await getUserPermissionCodes(client, user.userId, user.tenantId);

        const canSeeSales =
          permissions.includes('pos.create_sale') || permissions.includes('accounting.view');
        const canSeeInventory =
          permissions.includes('inventory.view') || permissions.includes('inventory.manage');
        const canSeeInvoices = permissions.includes('invoicing.manage');
        const canSeeTeam = permissions.includes('users.manage');

        const [todaySales, lowStock, outstandingInvoices, teamSize] = await Promise.all([
          canSeeSales ? this.getTodaySales(client, branchId) : Promise.resolve(null),
          canSeeInventory ? this.getLowStock(client, branchId) : Promise.resolve(null),
          canSeeInvoices ? this.getOutstandingInvoices(client) : Promise.resolve(null),
          canSeeTeam ? this.getTeamSize(client) : Promise.resolve(null),
        ]);

        return { todaySales, lowStock, outstandingInvoices, teamSize };
      },
    );
  }

  private async getTodaySales(client: PoolClient, branchId?: string) {
    const result = await client.query(
      `SELECT COUNT(*) AS count, COALESCE(SUM(total_ngn), 0) AS total
       FROM sales_transactions
       WHERE occurred_at::date = CURRENT_DATE
         AND status = 'completed'
         AND ($1::uuid IS NULL OR branch_id = $1)`,
      [branchId ?? null],
    );
    return {
      count: parseInt(result.rows[0].count, 10),
      total: round2(parseFloat(result.rows[0].total)),
    };
  }

  private async getLowStock(client: PoolClient, branchId?: string) {
    const result = await client.query(
      `SELECT s.product_id, p.name AS product_name, s.branch_id, b.name AS branch_name,
              s.quantity_on_hand, s.reorder_level
       FROM inventory_stock s
       JOIN products p ON p.id = s.product_id
       JOIN branches b ON b.id = s.branch_id
       WHERE s.quantity_on_hand <= s.reorder_level
         AND ($1::uuid IS NULL OR s.branch_id = $1)
       ORDER BY s.quantity_on_hand ASC
       LIMIT 10`,
      [branchId ?? null],
    );
    return {
      items: result.rows.map((r: any) => ({
        productId: r.product_id,
        productName: r.product_name,
        branchId: r.branch_id,
        branchName: r.branch_name,
        quantityOnHand: Number(r.quantity_on_hand),
        reorderLevel: Number(r.reorder_level),
      })),
    };
  }

  private async getOutstandingInvoices(client: PoolClient) {
    const result = await client.query(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(total_ngn - amount_paid_ngn), 0) AS total,
              COUNT(*) FILTER (WHERE due_date < CURRENT_DATE) AS overdue_count
       FROM invoices
       WHERE status IN ('sent', 'partially_paid')`,
    );
    return {
      count: parseInt(result.rows[0].count, 10),
      total: round2(parseFloat(result.rows[0].total)),
      overdueCount: parseInt(result.rows[0].overdue_count, 10),
    };
  }

  private async getTeamSize(client: PoolClient): Promise<number> {
    const result = await client.query(`SELECT COUNT(*) AS count FROM users WHERE status = 'active'`);
    return parseInt(result.rows[0].count, 10);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
