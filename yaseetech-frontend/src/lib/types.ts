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
