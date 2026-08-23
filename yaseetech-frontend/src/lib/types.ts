export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.code = body.error.code;
    this.status = status;
    this.details = body.error.details;
  }
}

export interface AuthUser {
  id: string;
  tenantId: string;
  email?: string;
  fullName?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface UserProfile {
  id: string;
  email: string;
  phone: string | null;
  full_name: string;
  status: string;
  created_at: string;
  roles: { name: string; branch_id: string | null }[];
}

export interface TeamMember {
  id: string;
  email: string;
  full_name: string;
  status: string;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  address: string | null;
  is_main_branch: boolean;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  category: string | null;
  cost_price_ngn: string;
  selling_price_ngn: string;
  unit_of_measure: string;
  is_active: boolean;
  created_at: string;
}

export interface StockRow {
  branch_id: string;
  product_id: string;
  sku: string;
  name: string;
  unit_of_measure: string;
  quantity_on_hand: string;
  reorder_level: string;
  updated_at: string;
}

export interface CartItem {
  productId: string;
  name: string;
  quantity: number;
  unitPriceNgn: number;
}

export interface SaleResult {
  id: string;
  transaction_number: string;
  total_ngn: string;
  items: { product_name: string; quantity: string; unit_price_ngn: string; line_total_ngn: string }[];
  payments: { method: string; amount_ngn: string }[];
  inventoryWarnings: string | null;
}

export interface ImportInvalidRow {
  rowNumber: number;
  errors: string[];
  raw: Record<string, string>;
}

export interface ImportValidRow {
  rowNumber: number;
  sku: string;
  name: string;
  category: string | null;
  costPriceNgn: number;
  sellingPriceNgn: number;
  unitOfMeasure: string;
  barcode: string | null;
  initialQuantity: number;
}

export interface ImportPreviewResult {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  validRows: ImportValidRow[];
  invalidRows: ImportInvalidRow[];
  duplicateSkusInFile: string[];
  duplicateSkusInDb: string[];
}

export interface ImportCommitResult {
  imported: number;
  skipped: number;
  skippedDetails: ImportInvalidRow[];
}

export interface Customer {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  total_spent_ngn: string;
  last_purchase_at: string | null;
  created_at: string;
}

export interface InvoiceListItem {
  id: string;
  invoice_number: string;
  status: 'draft' | 'sent' | 'partially_paid' | 'paid' | 'overdue' | 'cancelled';
  issue_date: string;
  due_date: string;
  subtotal_ngn: string;
  tax_ngn: string;
  total_ngn: string;
  amount_paid_ngn: string;
  customer_name: string;
  created_at: string;
  isOverdue: boolean;
}

export interface InvoiceDetail extends InvoiceListItem {
  customer_id: string;
  items: { description: string; quantity: string; unit_price_ngn: string; line_total_ngn: string }[];
  payments: { amount_ngn: string; paid_at: string; method: string | null; reference: string | null }[];
}

export interface ProfitAndLoss {
  period: { startDate: string; endDate: string };
  revenue: { code: string; name: string; amount: number }[];
  totalRevenue: number;
  expenses: { code: string; name: string; amount: number }[];
  totalExpenses: number;
  netIncome: number;
}

export interface BalanceSheet {
  asOfDate: string;
  assets: { code: string; name: string; balance: number }[];
  totalAssets: number;
  liabilities: { code: string; name: string; balance: number }[];
  totalLiabilities: number;
  equity: { code: string; name: string; balance: number }[];
  totalEquity: number;
  isBalanced: boolean;
}

export interface CashFlow {
  period: { startDate: string; endDate: string };
  byCategory: { category: string; cashIn: number; cashOut: number; net: number }[];
  totalCashIn: number;
  totalCashOut: number;
  netCashMovement: number;
}

export interface JournalEntry {
  id: string;
  entry_date: string;
  description: string;
  source_type: string;
  is_reversal: boolean;
  lines: { account: string; debit: string; credit: string }[];
}

export interface TeamMemberWithRole {
  id: string;
  email: string;
  full_name: string;
  status: string;
  created_at: string;
  role_name: string | null;
  branch_id: string | null;
}

export type AssignableRole = 'Branch Manager' | 'Accountant' | 'Cashier' | 'Staff';

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
