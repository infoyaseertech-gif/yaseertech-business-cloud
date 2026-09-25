import { HttpStatus, Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { DatabaseService } from '../common/database/database.service';
import { AppException } from '../common/exceptions/app.exception';
import { RequestUser } from '../common/guards/request-user.interface';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { RecordInvoicePaymentDto } from './dto/record-payment.dto';

const CASH_ACCOUNT_CODE = '1000';
const ACCOUNTS_RECEIVABLE_CODE = '1100';
const SALES_REVENUE_ACCOUNT_CODE = '4000';

@Injectable()
export class InvoicesService {
  constructor(private readonly db: DatabaseService) {}

  async list(user: RequestUser, status?: string) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const result = await client.query(
          `SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date,
                  i.subtotal_ngn, i.tax_ngn, i.total_ngn, i.amount_paid_ngn,
                  c.full_name AS customer_name, i.created_at
           FROM invoices i
           JOIN customers c ON c.id = i.customer_id
           WHERE ($1::text IS NULL OR i.status = $1)
           ORDER BY i.created_at DESC`,
          [status ?? null],
        );
        return result.rows.map(withDerivedOverdue);
      },
    );
  }

  async getOne(user: RequestUser, invoiceId: string) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => withDerivedOverdue(await this.getInvoiceDetail(client, invoiceId)),
    );
  }

  async create(user: RequestUser, dto: CreateInvoiceDto) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId, actorType: 'user' },
      async (client) => {
        const subtotal = round2(
          dto.items.reduce((sum, i) => sum + i.quantity * i.unitPriceNgn, 0),
        );
        const tax = 0; // Same v1 simplification as POS: no hardcoded tax rate (Phase 0, 2.3).
        const total = round2(subtotal + tax);
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;

        const invoiceResult = await client.query(
          `INSERT INTO invoices
             (tenant_id, branch_id, customer_id, invoice_number, status,
              issue_date, due_date, subtotal_ngn, tax_ngn, total_ngn, amount_paid_ngn)
           VALUES ($1, $2, $3, $4, 'draft', $5, $6, $7, $8, $9, 0)
           RETURNING id`,
          [
            user.tenantId,
            dto.branchId,
            dto.customerId,
            invoiceNumber,
            dto.issueDate ?? new Date().toISOString().slice(0, 10),
            dto.dueDate,
            subtotal,
            tax,
            total,
          ],
        );
        const invoiceId = invoiceResult.rows[0].id as string;

        for (const item of dto.items) {
          await client.query(
            `INSERT INTO invoice_items (tenant_id, invoice_id, product_id, description, quantity, unit_price_ngn, line_total_ngn)
             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            [
              user.tenantId,
              invoiceId,
              item.productId ?? null,
              item.description,
              item.quantity,
              item.unitPriceNgn,
              round2(item.quantity * item.unitPriceNgn),
            ],
          );
        }

        return withDerivedOverdue(await this.getInvoiceDetail(client, invoiceId));
      },
    );
  }

  /**
   * Transitions draft -> sent and posts the accrual journal entry
   * (Dr Accounts Receivable / Cr Sales Revenue). Deliberately NOT posted
   * at creation time -- a draft invoice isn't a real accounting event yet,
   * only a document being prepared. Posting revenue for a draft that might
   * never be sent would overstate the books.
   */
  async send(user: RequestUser, invoiceId: string) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId, actorType: 'user' },
      async (client) => {
        const invoice = await this.getInvoiceDetail(client, invoiceId);
        if (invoice.status !== 'draft') {
          throw new AppException(
            'INVOICE_NOT_DRAFT',
            `Cannot send an invoice with status "${invoice.status}". Only draft invoices can be sent.`,
            HttpStatus.BAD_REQUEST,
          );
        }

        await client.query(`UPDATE invoices SET status = 'sent', updated_at = now() WHERE id = $1`, [
          invoiceId,
        ]);

        await this.postJournalEntry(client, user.tenantId, {
          description: `Invoice ${invoice.invoice_number} sent`,
          sourceId: invoiceId,
          debitAccountCode: ACCOUNTS_RECEIVABLE_CODE,
          creditAccountCode: SALES_REVENUE_ACCOUNT_CODE,
          amount: Number(invoice.total_ngn),
        });

        return withDerivedOverdue(await this.getInvoiceDetail(client, invoiceId));
      },
    );
  }

  /**
   * Records a payment against a sent/partially-paid invoice, posts the
   * cash/AR relief entry (Dr Cash / Cr Accounts Receivable), and
   * recomputes status from the actual sum of payments rather than trusting
   * a running counter -- SUM(invoice_payments.amount_ngn) is the source of
   * truth, invoices.amount_paid_ngn is a cache of it.
   */
  async recordPayment(user: RequestUser, invoiceId: string, dto: RecordInvoicePaymentDto) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId, actorType: 'user' },
      async (client) => {
        const invoice = await this.getInvoiceDetail(client, invoiceId);

        if (invoice.status === 'draft') {
          throw new AppException(
            'INVOICE_NOT_SENT',
            'Cannot record a payment against a draft invoice. Send it first.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (invoice.status === 'cancelled') {
          throw new AppException(
            'INVOICE_CANCELLED',
            'Cannot record a payment against a cancelled invoice.',
            HttpStatus.BAD_REQUEST,
          );
        }

        await client.query(
          `INSERT INTO invoice_payments (tenant_id, invoice_id, amount_ngn, paid_at, method, reference)
           VALUES ($1, $2, $3, now(), $4, $5)`,
          [user.tenantId, invoiceId, dto.amountNgn, dto.method ?? null, dto.reference ?? null],
        );

        const totalPaidResult = await client.query(
          `SELECT COALESCE(SUM(amount_ngn), 0) AS total_paid FROM invoice_payments WHERE invoice_id = $1`,
          [invoiceId],
        );
        const totalPaid = Number(totalPaidResult.rows[0].total_paid);
        const newStatus = totalPaid >= Number(invoice.total_ngn) ? 'paid' : 'partially_paid';

        await client.query(
          `UPDATE invoices SET amount_paid_ngn = $1, status = $2, updated_at = now() WHERE id = $3`,
          [totalPaid, newStatus, invoiceId],
        );

        await this.postJournalEntry(client, user.tenantId, {
          description: `Payment received for invoice ${invoice.invoice_number}`,
          sourceId: invoiceId,
          debitAccountCode: CASH_ACCOUNT_CODE,
          creditAccountCode: ACCOUNTS_RECEIVABLE_CODE,
          amount: dto.amountNgn,
        });

        return withDerivedOverdue(await this.getInvoiceDetail(client, invoiceId));
      },
    );
  }

  private async getInvoiceDetail(client: PoolClient, invoiceId: string) {
    const invoiceResult = await client.query(
      `SELECT i.id, i.invoice_number, i.status, i.issue_date, i.due_date,
              i.subtotal_ngn, i.tax_ngn, i.total_ngn, i.amount_paid_ngn,
              i.customer_id, c.full_name AS customer_name, i.created_at
       FROM invoices i
       JOIN customers c ON c.id = i.customer_id
       WHERE i.id = $1`,
      [invoiceId],
    );
    if (invoiceResult.rows.length === 0) {
      throw new AppException('INVOICE_NOT_FOUND', 'Invoice not found.', HttpStatus.NOT_FOUND);
    }

    const itemsResult = await client.query(
      `SELECT description, quantity, unit_price_ngn, line_total_ngn FROM invoice_items WHERE invoice_id = $1`,
      [invoiceId],
    );
    const paymentsResult = await client.query(
      `SELECT amount_ngn, paid_at, method, reference FROM invoice_payments WHERE invoice_id = $1 ORDER BY paid_at ASC`,
      [invoiceId],
    );

    return {
      ...invoiceResult.rows[0],
      items: itemsResult.rows,
      payments: paymentsResult.rows,
    };
  }

  private async postJournalEntry(
    client: PoolClient,
    tenantId: string,
    args: {
      description: string;
      sourceId: string;
      debitAccountCode: string;
      creditAccountCode: string;
      amount: number;
    },
  ): Promise<void> {
    const accountsResult = await client.query(
      `SELECT code, id FROM accounts WHERE code IN ($1, $2)`,
      [args.debitAccountCode, args.creditAccountCode],
    );
    const accountsByCode = new Map(
      accountsResult.rows.map((a: any) => [a.code as string, a.id as string]),
    );
    const debitAccountId = accountsByCode.get(args.debitAccountCode);
    const creditAccountId = accountsByCode.get(args.creditAccountCode);

    if (!debitAccountId || !creditAccountId) {
      throw new AppException(
        'CHART_OF_ACCOUNTS_NOT_SEEDED',
        'Required accounts are missing for this business. Contact support.',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const entryResult = await client.query(
      `INSERT INTO journal_entries (tenant_id, entry_date, description, source_type, source_id)
       VALUES ($1, CURRENT_DATE, $2, 'invoice', $3)
       RETURNING id`,
      [tenantId, args.description, args.sourceId],
    );

    await client.query(
      `INSERT INTO journal_entry_lines (tenant_id, journal_entry_id, account_id, debit_ngn, credit_ngn)
       VALUES ($1, $2, $3, $4, 0), ($1, $2, $5, 0, $4)`,
      [tenantId, entryResult.rows[0].id, debitAccountId, args.amount, creditAccountId],
    );
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * "Overdue" is computed on read, not stored -- flipping status to
 * 'overdue' for real would need a scheduled job (Phase 8 infra doesn't
 * exist yet), so this derives it from due_date instead. Stated in the
 * README as a deliberate v1 simplification, not silently different from
 * what the master spec describes.
 */
function withDerivedOverdue<T extends { status: string; due_date: string }>(
  invoice: T,
): T & { isOverdue: boolean } {
  const isOverdue =
    (invoice.status === 'sent' || invoice.status === 'partially_paid') &&
    new Date(invoice.due_date) < new Date();
  return { ...invoice, isOverdue };
}
