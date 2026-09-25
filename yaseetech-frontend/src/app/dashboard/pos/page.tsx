'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { ApiError, Branch, CartItem, Product, SaleResult } from '@/lib/types';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';

function generateUuid(): string {
  // Real browsers all support crypto.randomUUID(); this matches exactly
  // what an offline POS client would generate at checkout time, per the
  // Phase 2 schema's client_transaction_uuid idempotency key.
  return crypto.randomUUID();
}

export default function PosPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer'>('cash');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState<SaleResult | null>(null);

  useEffect(() => {
    Promise.all([apiFetch<Branch[]>('/branches'), apiFetch<Product[]>('/products')])
      .then(([branchList, productList]) => {
        setBranches(branchList);
        setProducts(productList);
        const main = branchList.find((b) => b.is_main_branch) ?? branchList[0];
        if (main) setBranchId(main.id);
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load POS data.');
      });
  }, []);

  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((i) => i.productId === product.id);
      if (existing) {
        return prev.map((i) =>
          i.productId === product.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPriceNgn: Number(product.selling_price_ngn),
        },
      ];
    });
  }

  function updateQuantity(productId: string, quantity: number) {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((i) => i.productId !== productId));
      return;
    }
    setCart((prev) => prev.map((i) => (i.productId === productId ? { ...i, quantity } : i)));
  }

  const total = cart.reduce((sum, i) => sum + i.quantity * i.unitPriceNgn, 0);

  async function handleCheckout() {
    if (cart.length === 0 || !branchId) return;
    setCheckoutError(null);
    setCheckingOut(true);
    try {
      const sale = await apiFetch<SaleResult>('/pos/sales', {
        method: 'POST',
        body: JSON.stringify({
          branchId,
          items: cart.map((i) => ({ productId: i.productId, quantity: i.quantity })),
          payments: [{ method: paymentMethod, amountNgn: total }],
          clientTransactionUuid: generateUuid(),
        }),
      });
      setReceipt(sale);
      setCart([]);
    } catch (err) {
      setCheckoutError(err instanceof ApiError ? err.message : 'Checkout failed.');
    } finally {
      setCheckingOut(false);
    }
  }

  if (receipt) {
    return <Receipt sale={receipt} onNewSale={() => setReceipt(null)} />;
  }

  return (
    <div>
      <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-600">Point of sale</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink">Ring up a sale</h1>

      {loadError && (
        <div className="mt-6 max-w-lg">
          <ErrorBanner message={loadError} />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {branches.length > 1 && (
            <select
              className="mb-4 rounded-lg border border-border bg-white px-3.5 py-2 text-sm text-ink"
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {products.map((product) => (
              <button
                key={product.id}
                onClick={() => addToCart(product)}
                className="rounded-xl border border-border bg-white p-4 text-left hover:border-indigo hover:shadow-sm transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
              >
                <p className="font-medium text-ink text-sm">{product.name}</p>
                <p className="mt-1 font-mono text-xs text-ink-soft">
                  &#8358;{Number(product.selling_price_ngn).toLocaleString()}
                </p>
              </button>
            ))}
            {products.length === 0 && !loadError && (
              <p className="col-span-full text-sm text-ink-soft py-8 text-center">
                No products yet. Add some from the Inventory page first.
              </p>
            )}
          </div>
        </div>

        <div className="ledger-tape-edge rounded-2xl bg-indigo text-paper p-6 flex flex-col h-fit sticky top-8">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-100/70">
            Current sale
          </p>

          <div className="mt-4 flex-1 space-y-0 min-h-[4rem]">
            {cart.length === 0 && (
              <p className="text-sm text-paper/50 py-6 text-center">Cart is empty</p>
            )}
            {cart.map((item) => (
              <div
                key={item.productId}
                className="flex items-center justify-between gap-2 border-b border-dashed border-white/15 py-2.5 text-sm"
              >
                <span className="text-paper/90 flex-1 truncate">{item.name}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    aria-label={`Decrease quantity of ${item.name}`}
                    onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                    className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-paper"
                  >
                    &minus;
                  </button>
                  <span className="font-mono w-5 text-center">{item.quantity}</span>
                  <button
                    aria-label={`Increase quantity of ${item.name}`}
                    onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                    className="w-6 h-6 rounded bg-white/10 hover:bg-white/20 text-paper"
                  >
                    +
                  </button>
                </div>
                <span className="font-mono text-gold-100 w-20 text-right">
                  &#8358;{(item.quantity * item.unitPriceNgn).toLocaleString()}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-baseline justify-between border-t border-white/15 pt-4">
            <span className="text-sm text-paper/70">Total</span>
            <span className="font-mono text-xl text-paper font-medium">
              &#8358;{total.toLocaleString()}
            </span>
          </div>

          <div className="mt-4">
            <label className="block text-xs text-paper/70 mb-1.5">Payment method</label>
            <div className="grid grid-cols-3 gap-1.5">
              {(['cash', 'card', 'transfer'] as const).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={`rounded-lg px-2 py-1.5 text-xs capitalize transition-colors ${
                    paymentMethod === method
                      ? 'bg-gold text-indigo font-medium'
                      : 'bg-white/10 text-paper/80 hover:bg-white/20'
                  }`}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          {checkoutError && (
            <p role="alert" className="mt-3 text-sm text-red-300">
              {checkoutError}
            </p>
          )}

          <div className="mt-5">
            <Button
              onClick={handleCheckout}
              loading={checkingOut}
              disabled={cart.length === 0}
            >
              Charge &#8358;{total.toLocaleString()}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Receipt({ sale, onNewSale }: { sale: SaleResult; onNewSale: () => void }) {
  return (
    <div className="max-w-md mx-auto">
      <div className="ledger-tape-edge rounded-2xl bg-white border border-border p-8">
        <p className="text-center font-display text-xl font-semibold text-ink">
          Sale complete
        </p>
        <p className="text-center font-mono text-xs text-ink-soft mt-1">
          {sale.transaction_number}
        </p>

        <div className="mt-6 space-y-0">
          {sale.items.map((item, i) => (
            <div key={i} className="ledger-row text-sm">
              <span className="text-ink">
                {item.product_name} &times; {item.quantity}
              </span>
              <span className="font-mono text-ink">
                &#8358;{Number(item.line_total_ngn).toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
          <span className="font-medium text-ink">Total</span>
          <span className="font-mono text-xl font-semibold text-ink">
            &#8358;{Number(sale.total_ngn).toLocaleString()}
          </span>
        </div>

        {sale.inventoryWarnings && (
          <div className="mt-4 rounded-lg border border-dashed border-danger/40 bg-danger/5 px-3 py-2.5 text-xs text-danger">
            {sale.inventoryWarnings}
          </div>
        )}

        <div className="mt-6">
          <Button onClick={onNewSale}>New sale</Button>
        </div>
      </div>
    </div>
  );
}
