import { HttpStatus, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../common/database/database.service';
import { AppException } from '../common/exceptions/app.exception';
import { RequestUser } from '../common/guards/request-user.interface';
import { CreateSaleDto } from './dto/create-sale.dto';

const CASH_ACCOUNT_CODE = '1000';
const SALES_REVENUE_ACCOUNT_CODE = '4000';

@Injectable()
export class PosService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Creates a sale, its line items, its payment(s), the resulting
   * inventory movements, and the auto-generated journal entry -- all in
   * one transaction, so a partial failure never leaves a sale recorded
   * without its stock/accounting effects (or vice versa).
   *
   * Idempotent on (tenant_id, client_transaction_uuid): retrying the same
   * sale (a flaky connection, an offline client resyncing) is a no-op that
   * returns the original sale rather than creating a duplicate or erroring.
   */
  async createSale(user: RequestUser, dto: CreateSaleDto) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId, actorType: 'user' },
      async (client) => {
        const existing = await client.query(
          `SELECT id FROM sales_transactions WHERE client_transaction_uuid = $1`,
          [dto.clientTransactionUuid],
        );
        if (existing.rows.length > 0) {
          return this.getSaleDetail(client, existing.rows[0].id as string);
        }

        const productIds = dto.items.map((i) => i.productId);
        const productsResult = await client.query(
          `SELECT id, name, selling_price_ngn FROM products WHERE id = ANY($1::uuid[])`,
          [productIds],
        );
        const productsById = new Map(
          productsResult.rows.map((p: any) => [p.id as string, p]),
        );

        const missingProduct = productIds.find((id) => !productsById.has(id));
        if (missingProduct) {
          throw new AppException(
            'PRODUCT_NOT_FOUND',
            `Product ${missingProduct} does not exist.`,
            HttpStatus.BAD_REQUEST,
          );
        }

        const lineItems = dto.items.map((item) => {
          const product = productsById.get(item.productId)!;
          const unitPrice = item.unitPriceNgn ?? Number(product.selling_price_ngn);
          const lineTotal = round2(unitPrice * item.quantity);
          return { ...item, unitPrice, lineTotal, productName: product.name as string };
        });

        const subtotal = round2(lineItems.reduce((sum, i) => sum + i.lineTotal, 0));
        const tax = 0; // Deferred: configurable tax-rate table is Phase 6 accounting scope (Phase 0, 2.3) -- never hardcode a rate.
        const total = round2(subtotal + tax);

        const paidTotal = round2(dto.payments.reduce((sum, p) => sum + p.amountNgn, 0));
        if (paidTotal !== total) {
          throw new AppException(
            'PAYMENT_AMOUNT_MISMATCH',
            `Payments total ₦${paidTotal} but the sale total is ₦${total}.`,
            HttpStatus.BAD_REQUEST,
            { paidTotal, total },
          );
        }

        // v1 simplification, stated plainly: transaction numbers are
        // time-based, not a gapless per-branch sequence. A real receipt
        // numbering scheme needs a dedicated counter table with row
        // locking to avoid races under concurrent checkouts -- worth
        // doing before this matters for real paper receipts, not required
        // for Phase 4's functional correctness.
        const transactionNumber = `S-${Date.now().toString(36).toUpperCase()}`;

        const saleResult = await client.query(
          `INSERT INTO sales_transactions
             (tenant_id, branch_id, customer_id, cashier_user_id, transaction_number,
              client_transaction_uuid, subtotal_ngn, tax_ngn, discount_ngn, total_ngn,
              occurred_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, $9, $10)
           RETURNING id, transaction_number, created_at, occurred_at`,
          [
            user.tenantId,
            dto.branchId,
            dto.customerId ?? null,
            user.userId,
            transactionNumber,
            dto.clientTransactionUuid,
            subtotal,
            tax,
            total,
            dto.occurredAt ?? new Date().toISOString(),
          ],
        );
        const saleId = saleResult.rows[0].id as string;

        for (const item of lineItems) {
          await client.query(
            `INSERT INTO sales_transaction_items
               (tenant_id, sales_transaction_id, product_id, quantity, unit_price_ngn, tax_ngn, line_total_ngn)
             VALUES ($1, $2, $3, $4, $5, 0, $6)`,
            [user.tenantId, saleId, item.productId, item.quantity, item.unitPrice, item.lineTotal],
          );
        }

        for (const payment of dto.payments) {
          await client.query(
            `INSERT INTO sales_payments (tenant_id, sales_transaction_id, method, amount_ngn, reference)
             VALUES ($1, $2, $3, $4, $5)`,
            [user.tenantId, saleId, payment.method, payment.amountNgn, payment.reference ?? null],
          );
        }

        const flaggedItems: string[] = [];
        for (const item of lineItems) {
          const movementResult = await client.query(
            `INSERT INTO inventory_movements
               (tenant_id, branch_id, product_id, movement_type, quantity_delta,
                reference_type, reference_id, performed_by_user_id)
             VALUES ($1, $2, $3, 'sale', $4, 'sales_transaction', $5, $6)
             RETURNING id`,
            [user.tenantId, dto.branchId, item.productId, -item.quantity, saleId, user.userId],
          );

          const stockResult = await client.query(
            `INSERT INTO inventory_stock (tenant_id, branch_id, product_id, quantity_on_hand)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (branch_id, product_id)
             DO UPDATE SET quantity_on_hand = inventory_stock.quantity_on_hand + EXCLUDED.quantity_on_hand,
                           updated_at = now()
             RETURNING quantity_on_hand`,
            [user.tenantId, dto.branchId, item.productId, -item.quantity],
          );

          // Negative stock never blocks the sale -- the sale already
          // happened physically -- it's flagged for a manager to resolve,
          // per Phase 1, Section 6.3.
          if (Number(stockResult.rows[0].quantity_on_hand) < 0) {
            await client.query(
              `UPDATE inventory_movements SET is_conflict_flagged = true WHERE id = $1`,
              [movementResult.rows[0].id],
            );
            flaggedItems.push(item.productName);
          }
        }

        await this.postSaleJournalEntry(client, user.tenantId, saleId, transactionNumber, total);

        return {
          ...(await this.getSaleDetail(client, saleId)),
          inventoryWarnings:
            flaggedItems.length > 0
              ? `Stock went negative for: ${flaggedItems.join(', ')}. Flagged for manager review.`
              : null,
        };
      },
    );
  }

  async listSales(user: RequestUser, branchId: string | undefined, limit: number) {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const result = await client.query(
          `SELECT id, transaction_number, branch_id, subtotal_ngn, tax_ngn,
                  discount_ngn, total_ngn, status, occurred_at, created_at
           FROM sales_transactions
           WHERE ($1::uuid IS NULL OR branch_id = $1)
           ORDER BY created_at DESC
           LIMIT $2`,
          [branchId ?? null, safeLimit],
        );
        return result.rows;
      },
    );
  }

  private async getSaleDetail(client: PoolClient, saleId: string) {
    const saleResult = await client.query(
      `SELECT id, transaction_number, branch_id, customer_id, subtotal_ngn,
              tax_ngn, discount_ngn, total_ngn, status, occurred_at, created_at
       FROM sales_transactions WHERE id = $1`,
      [saleId],
    );
    const itemsResult = await client.query(
      `SELECT ti.product_id, p.name AS product_name, ti.quantity,
              ti.unit_price_ngn, ti.line_total_ngn
       FROM sales_transaction_items ti
       JOIN products p ON p.id = ti.product_id
       WHERE ti.sales_transaction_id = $1`,
      [saleId],
    );
    const paymentsResult = await client.query(
      `SELECT method, amount_ngn, reference FROM sales_payments WHERE sales_transaction_id = $1`,
      [saleId],
    );

    return {
      ...saleResult.rows[0],
      items: itemsResult.rows,
      payments: paymentsResult.rows,
    };
  }

  /**
   * v1 simplification, stated plainly: every payment method debits the
   * Cash account. A real chart of accounts would route card/transfer
   * payments to an "Undeposited Funds" or bank clearing account instead --
   * that distinction belongs to Phase 6 (Accounting), which owns the
   * chart-of-accounts design. This is enough to keep the books balanced
   * and auditable for v1 without inventing Phase 6's design here.
   */
  private async postSaleJournalEntry(
    client: PoolClient,
    tenantId: string,
    saleId: string,
    transactionNumber: string,
    total: number,
  ): Promise<void> {
    const accountsResult = await client.query(
      `SELECT code, id FROM accounts WHERE code IN ($1, $2)`,
      [CASH_ACCOUNT_CODE, SALES_REVENUE_ACCOUNT_CODE],
    );
    const accountsByCode = new Map(
      accountsResult.rows.map((a: any) => [a.code as string, a.id as string]),
    );
    const cashAccountId = accountsByCode.get(CASH_ACCOUNT_CODE);
    const revenueAccountId = accountsByCode.get(SALES_REVENUE_ACCOUNT_CODE);

    if (!cashAccountId || !revenueAccountId) {
      // Fails loudly rather than posting an unbalanced or incomplete
      // entry -- a tenant whose seed/onboarding didn't create the standard
      // chart of accounts needs to be fixed, not silently skipped.
      throw new AppException(
        'CHART_OF_ACCOUNTS_NOT_SEEDED',
        'Standard accounts (Cash, Sales Revenue) are missing for this business. Contact support.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const entryResult = await client.query(
      `INSERT INTO journal_entries (tenant_id, entry_date, description, source_type, source_id)
       VALUES ($1, CURRENT_DATE, $2, 'sale', $3)
       RETURNING id`,
      [tenantId, `Sale ${transactionNumber}`, saleId],
    );
    const journalEntryId = entryResult.rows[0].id;

    await client.query(
      `INSERT INTO journal_entry_lines (tenant_id, journal_entry_id, account_id, debit_ngn, credit_ngn)
       VALUES ($1, $2, $3, $4, 0), ($1, $2, $5, 0, $4)`,
      [tenantId, journalEntryId, cashAccountId, total, revenueAccountId],
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
