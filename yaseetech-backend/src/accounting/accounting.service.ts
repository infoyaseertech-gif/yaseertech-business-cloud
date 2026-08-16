import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../common/database/database.service';
import { RequestUser } from '../common/guards/request-user.interface';

interface AccountAggregate {
  account_type: string;
  code: string;
  name: string;
  total_debit: string;
  total_credit: string;
}

@Injectable()
export class AccountingService {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Income Statement for a date range. Revenue's normal balance is credit
   * (credit - debit); Expense's normal balance is debit (debit - credit).
   * Nothing here posts anything -- it reads exactly what POS and
   * Invoicing already wrote to journal_entry_lines.
   */
  async profitAndLoss(user: RequestUser, startDate: string, endDate: string) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const result = await client.query<AccountAggregate>(
          `SELECT a.account_type, a.code, a.name,
                  COALESCE(SUM(jel.debit_ngn), 0) AS total_debit,
                  COALESCE(SUM(jel.credit_ngn), 0) AS total_credit
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id
           JOIN accounts a ON a.id = jel.account_id
           WHERE je.entry_date BETWEEN $1 AND $2
             AND a.account_type IN ('revenue', 'expense')
           GROUP BY a.id, a.code, a.name, a.account_type
           ORDER BY a.account_type, a.code`,
          [startDate, endDate],
        );

        const revenueLines = result.rows
          .filter((r) => r.account_type === 'revenue')
          .map((r) => ({ code: r.code, name: r.name, amount: round2(num(r.total_credit) - num(r.total_debit)) }));
        const expenseLines = result.rows
          .filter((r) => r.account_type === 'expense')
          .map((r) => ({ code: r.code, name: r.name, amount: round2(num(r.total_debit) - num(r.total_credit)) }));

        const totalRevenue = round2(revenueLines.reduce((s, l) => s + l.amount, 0));
        const totalExpenses = round2(expenseLines.reduce((s, l) => s + l.amount, 0));

        return {
          period: { startDate, endDate },
          revenue: revenueLines,
          totalRevenue,
          expenses: expenseLines,
          totalExpenses,
          netIncome: round2(totalRevenue - totalExpenses),
        };
      },
    );
  }

  /**
   * Balance Sheet as of a date -- cumulative since inception, not just the
   * given period, which is what "as of" means for a balance sheet (unlike
   * P&L, which is period-based).
   *
   * v1 simplification, stated plainly: there's no period-closing process
   * (no journal entries that zero out revenue/expense into a permanent
   * equity account at year-end). Instead, cumulative net income since
   * inception is folded directly into equity as "Retained Earnings" on
   * every call. This keeps the balance sheet mathematically balanced
   * (guaranteed by double-entry) without needing a closing-entry feature
   * that v1 doesn't have. A real close-the-books process is a reasonable
   * v2 addition once there's a fiscal year concept to close against.
   */
  async balanceSheet(user: RequestUser, asOfDate: string) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const result = await client.query<AccountAggregate>(
          `SELECT a.account_type, a.code, a.name,
                  COALESCE(SUM(jel.debit_ngn), 0) AS total_debit,
                  COALESCE(SUM(jel.credit_ngn), 0) AS total_credit
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id
           JOIN accounts a ON a.id = jel.account_id
           WHERE je.entry_date <= $1
           GROUP BY a.id, a.code, a.name, a.account_type
           ORDER BY a.account_type, a.code`,
          [asOfDate],
        );

        const byType = (type: string, normalSide: 'debit' | 'credit') =>
          result.rows
            .filter((r) => r.account_type === type)
            .map((r) => ({
              code: r.code,
              name: r.name,
              balance: round2(
                normalSide === 'debit'
                  ? num(r.total_debit) - num(r.total_credit)
                  : num(r.total_credit) - num(r.total_debit),
              ),
            }));

        const assets = byType('asset', 'debit');
        const liabilities = byType('liability', 'credit');
        const equityAccounts = byType('equity', 'credit');
        const revenueTotal = byType('revenue', 'credit').reduce((s, a) => s + a.balance, 0);
        const expenseTotal = byType('expense', 'debit').reduce((s, a) => s + a.balance, 0);
        const retainedEarnings = round2(revenueTotal - expenseTotal);

        const totalAssets = round2(assets.reduce((s, a) => s + a.balance, 0));
        const totalLiabilities = round2(liabilities.reduce((s, a) => s + a.balance, 0));
        const totalEquity = round2(
          equityAccounts.reduce((s, a) => s + a.balance, 0) + retainedEarnings,
        );

        return {
          asOfDate,
          assets,
          totalAssets,
          liabilities,
          totalLiabilities,
          equity: [...equityAccounts, { code: '3900', name: 'Retained Earnings (cumulative)', balance: retainedEarnings }],
          totalEquity,
          // Should always be true -- double-entry guarantees it mathematically.
          // Included so a discrepancy would be immediately visible rather than
          // silently trusted, per the same spirit as the DB-level balance trigger.
          isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
        };
      },
    );
  }

  /**
   * v1 simplification, stated plainly: this is a simple CASH MOVEMENT
   * report (what moved through the Cash account, grouped by source), not a
   * full GAAP indirect/direct-method Statement of Cash Flows (which
   * reconciles net income to cash via working-capital adjustments). That's
   * meaningfully more complex and not needed for an SME owner asking "did
   * cash go up or down and why" -- which is what this answers.
   */
  async cashFlow(user: RequestUser, startDate: string, endDate: string) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const result = await client.query(
          `SELECT je.source_type,
                  COALESCE(SUM(jel.debit_ngn), 0) AS cash_in,
                  COALESCE(SUM(jel.credit_ngn), 0) AS cash_out
           FROM journal_entry_lines jel
           JOIN journal_entries je ON je.id = jel.journal_entry_id
           JOIN accounts a ON a.id = jel.account_id
           WHERE a.code = '1000' AND je.entry_date BETWEEN $1 AND $2
           GROUP BY je.source_type
           ORDER BY je.source_type`,
          [startDate, endDate],
        );

        const byCategory = result.rows.map((r: any) => ({
          category: r.source_type,
          cashIn: round2(num(r.cash_in)),
          cashOut: round2(num(r.cash_out)),
          net: round2(num(r.cash_in) - num(r.cash_out)),
        }));

        const totalCashIn = round2(byCategory.reduce((s, c) => s + c.cashIn, 0));
        const totalCashOut = round2(byCategory.reduce((s, c) => s + c.cashOut, 0));

        return {
          period: { startDate, endDate },
          byCategory,
          totalCashIn,
          totalCashOut,
          netCashMovement: round2(totalCashIn - totalCashOut),
        };
      },
    );
  }

  async journal(user: RequestUser, startDate: string | undefined, endDate: string | undefined, limit: number) {
    const safeLimit = Math.min(Math.max(limit, 1), 200);
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const entriesResult = await client.query(
          `SELECT id, entry_date, description, source_type, is_reversal, created_at
           FROM journal_entries
           WHERE ($1::date IS NULL OR entry_date >= $1)
             AND ($2::date IS NULL OR entry_date <= $2)
           ORDER BY entry_date DESC, created_at DESC
           LIMIT $3`,
          [startDate ?? null, endDate ?? null, safeLimit],
        );

        if (entriesResult.rows.length === 0) return [];

        const entryIds = entriesResult.rows.map((e: any) => e.id);
        const linesResult = await client.query(
          `SELECT jel.journal_entry_id, a.code, a.name, jel.debit_ngn, jel.credit_ngn
           FROM journal_entry_lines jel
           JOIN accounts a ON a.id = jel.account_id
           WHERE jel.journal_entry_id = ANY($1::uuid[])
           ORDER BY jel.created_at ASC`,
          [entryIds],
        );

        const linesByEntry = new Map<string, any[]>();
        for (const line of linesResult.rows) {
          const list = linesByEntry.get(line.journal_entry_id) ?? [];
          list.push({ account: `${line.code} ${line.name}`, debit: line.debit_ngn, credit: line.credit_ngn });
          linesByEntry.set(line.journal_entry_id, list);
        }

        return entriesResult.rows.map((entry: any) => ({
          ...entry,
          lines: linesByEntry.get(entry.id) ?? [],
        }));
      },
    );
  }

  async chartOfAccounts(user: RequestUser) {
    return this.db.withTenantContext(
      { tenantId: user.tenantId, userId: user.userId },
      async (client) => {
        const today = new Date().toISOString().slice(0, 10);
        const result = await client.query<AccountAggregate & { id: string }>(
          `SELECT a.id, a.account_type, a.code, a.name,
                  COALESCE(SUM(jel.debit_ngn), 0) AS total_debit,
                  COALESCE(SUM(jel.credit_ngn), 0) AS total_credit
           FROM accounts a
           LEFT JOIN journal_entry_lines jel ON jel.account_id = a.id
           LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.entry_date <= $1
           GROUP BY a.id, a.code, a.name, a.account_type
           ORDER BY a.code`,
          [today],
        );

        const normalDebitSide = new Set(['asset', 'expense']);

        return result.rows.map((r) => ({
          code: r.code,
          name: r.name,
          accountType: r.account_type,
          balance: round2(
            normalDebitSide.has(r.account_type)
              ? num(r.total_debit) - num(r.total_credit)
              : num(r.total_credit) - num(r.total_debit),
          ),
        }));
      },
    );
  }
}

function num(v: string | number): number {
  return typeof v === 'number' ? v : parseFloat(v);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
