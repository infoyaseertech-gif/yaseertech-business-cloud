'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
import { ApiError, Branch, Product, StockRow } from '@/lib/types';
import { Field } from '@/components/Field';
import { Button } from '@/components/Button';
import { ErrorBanner } from '@/components/ErrorBanner';

const emptyForm = {
  sku: '',
  name: '',
  category: '',
  costPriceNgn: '',
  sellingPriceNgn: '',
  unitOfMeasure: 'unit',
};

export default function InventoryPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>('');
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadStock = useCallback(async (forBranchId: string) => {
    try {
      const rows = await apiFetch<StockRow[]>(`/inventory/stock?branchId=${forBranchId}`);
      setStock(rows);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load stock.');
    }
  }, []);

  useEffect(() => {
    Promise.all([apiFetch<Branch[]>('/branches'), apiFetch<Product[]>('/products')])
      .then(([branchList, productList]) => {
        setBranches(branchList);
        setProducts(productList);
        const main = branchList.find((b) => b.is_main_branch) ?? branchList[0];
        if (main) {
          setBranchId(main.id);
          loadStock(main.id);
        }
      })
      .catch((err) => {
        setLoadError(err instanceof ApiError ? err.message : 'Could not load inventory.');
      });
  }, [loadStock]);

  function stockFor(productId: string): StockRow | undefined {
    return stock.find((s) => s.product_id === productId);
  }

  function update(field: keyof typeof form) {
    return (e: ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleCreateProduct(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      const created = await apiFetch<Product>('/products', {
        method: 'POST',
        body: JSON.stringify({
          sku: form.sku,
          name: form.name,
          category: form.category || undefined,
          costPriceNgn: Number(form.costPriceNgn),
          sellingPriceNgn: Number(form.sellingPriceNgn),
          unitOfMeasure: form.unitOfMeasure || undefined,
        }),
      });
      setProducts((p) => [...p, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm(emptyForm);
      setShowForm(false);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Could not create product.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-gold-600">Inventory</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-ink">
            Products &amp; stock
          </h1>
        </div>
        <Button onClick={() => setShowForm((s) => !s)} type="button">
          {showForm ? 'Cancel' : '+ Add product'}
        </Button>
      </div>

      {branches.length > 1 && (
        <div className="mt-6 max-w-xs">
          <label htmlFor="branch" className="block text-sm font-medium text-ink mb-1.5">
            Branch
          </label>
          <select
            id="branch"
            className="w-full rounded-lg border border-border bg-white px-3.5 py-2.5 text-ink"
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              loadStock(e.target.value);
            }}
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {showForm && (
        <form
          onSubmit={handleCreateProduct}
          className="mt-6 rounded-2xl border border-border bg-white p-6 grid grid-cols-1 sm:grid-cols-2 gap-5"
        >
          <div className="sm:col-span-2">
            <ErrorBanner message={formError} />
          </div>
          <Field id="sku" label="SKU" required value={form.sku} onChange={update('sku')} />
          <Field id="name" label="Product name" required value={form.name} onChange={update('name')} />
          <Field id="category" label="Category (optional)" value={form.category} onChange={update('category')} />
          <Field
            id="unitOfMeasure"
            label="Unit"
            value={form.unitOfMeasure}
            onChange={update('unitOfMeasure')}
          />
          <Field
            id="costPriceNgn"
            label="Cost price (₦)"
            type="number"
            min="0"
            required
            value={form.costPriceNgn}
            onChange={update('costPriceNgn')}
          />
          <Field
            id="sellingPriceNgn"
            label="Selling price (₦)"
            type="number"
            min="0"
            required
            value={form.sellingPriceNgn}
            onChange={update('sellingPriceNgn')}
          />
          <div className="sm:col-span-2">
            <Button type="submit" loading={saving}>
              Save product
            </Button>
          </div>
        </form>
      )}

      {loadError && (
        <div className="mt-6">
          <ErrorBanner message={loadError} />
        </div>
      )}

      <div className="mt-8 rounded-2xl border border-border bg-white overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-indigo-100/40 text-left">
              <th className="px-5 py-3 font-medium text-ink-soft">Product</th>
              <th className="px-5 py-3 font-medium text-ink-soft">SKU</th>
              <th className="px-5 py-3 font-medium text-ink-soft">Selling price</th>
              <th className="px-5 py-3 font-medium text-ink-soft">Stock on hand</th>
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-ink-soft text-sm">
                  No products yet &mdash; add your first one above.
                </td>
              </tr>
            )}
            {products.map((product) => {
              const row = stockFor(product.id);
              const qty = row ? Number(row.quantity_on_hand) : 0;
              const low = row && qty <= Number(row.reorder_level);
              return (
                <tr key={product.id} className="border-b border-dashed border-border last:border-none">
                  <td className="px-5 py-3.5 text-ink font-medium">{product.name}</td>
                  <td className="px-5 py-3.5 text-ink-soft font-mono text-xs">{product.sku}</td>
                  <td className="px-5 py-3.5 font-mono text-ink">
                    &#8358;{Number(product.selling_price_ngn).toLocaleString()}
                  </td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`font-mono ${low ? 'text-danger font-medium' : 'text-ink'}`}
                    >
                      {row ? qty : '\u2014'} {product.unit_of_measure}
                      {low && ' \u26a0'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
