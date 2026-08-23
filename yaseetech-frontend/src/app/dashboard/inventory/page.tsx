'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { apiFetch } from '@/lib/api';
import {
  ApiError,
  Branch,
  ImportCommitResult,
  ImportPreviewResult,
  Product,
  StockRow,
} from '@/lib/types';
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

const CSV_TEMPLATE_HEADERS =
  'sku,name,category,cost_price_ngn,selling_price_ngn,unit_of_measure,barcode,initial_quantity';
const CSV_TEMPLATE_EXAMPLE = 'RICE-50KG,Rice 50kg bag,Staples,42000,48000,bag,,40';

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

  const [showImport, setShowImport] = useState(false);
  const [csvContent, setCsvContent] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [commitLoading, setCommitLoading] = useState(false);
  const [commitResult, setCommitResult] = useState<ImportCommitResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadStock = useCallback(async (forBranchId: string) => {
    try {
      const rows = await apiFetch<StockRow[]>(`/inventory/stock?branchId=${forBranchId}`);
      setStock(rows);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load stock.');
    }
  }, []);

  const loadProducts = useCallback(async () => {
    const list = await apiFetch<Product[]>('/products');
    setProducts(list);
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

  function downloadTemplate() {
    const blob = new Blob([`${CSV_TEMPLATE_HEADERS}\n${CSV_TEMPLATE_EXAMPLE}\n`], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'yaseetech-product-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetImport() {
    setCsvContent(null);
    setCsvFileName(null);
    setPreview(null);
    setCommitResult(null);
    setImportError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setCommitResult(null);
    setCsvFileName(file.name);

    const text = await file.text();
    setCsvContent(text);
    setPreviewLoading(true);
    try {
      const result = await apiFetch<ImportPreviewResult>('/products/import/preview', {
        method: 'POST',
        body: JSON.stringify({ csvContent: text }),
      });
      setPreview(result);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Could not read this file.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleConfirmImport() {
    if (!csvContent || !branchId) return;
    setImportError(null);
    setCommitLoading(true);
    try {
      const result = await apiFetch<ImportCommitResult>('/products/import/commit', {
        method: 'POST',
        body: JSON.stringify({ csvContent, branchId }),
      });
      setCommitResult(result);
      setPreview(null);
      await Promise.all([loadProducts(), loadStock(branchId)]);
    } catch (err) {
      setImportError(err instanceof ApiError ? err.message : 'Import failed.');
    } finally {
      setCommitLoading(false);
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
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setShowImport((s) => !s);
              setShowForm(false);
              if (showImport) resetImport();
            }}
            className="rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-medium text-ink hover:bg-paper"
          >
            {showImport ? 'Cancel import' : '\u2191 Import CSV'}
          </button>
          <Button
            onClick={() => {
              setShowForm((s) => !s);
              setShowImport(false);
            }}
            type="button"
          >
            {showForm ? 'Cancel' : '+ Add product'}
          </Button>
        </div>
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

      {showImport && (
        <div className="mt-6 rounded-2xl border border-border bg-white p-6">
          {!csvContent && (
            <>
              <p className="text-sm text-ink-soft">
                Upload a CSV of products to add many at once. Nothing is saved until you review
                and confirm the results below.
              </p>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded-lg bg-indigo px-4 py-2.5 text-sm font-medium text-paper hover:bg-indigo-600"
                >
                  Choose CSV file
                </button>
                <button type="button" onClick={downloadTemplate} className="text-sm text-indigo underline underline-offset-2">
                  Download a template
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileSelected}
                className="hidden"
              />
              <p className="mt-3 text-xs text-ink-soft font-mono">{CSV_TEMPLATE_HEADERS}</p>
            </>
          )}

          {csvContent && (
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-ink">
                  <span className="font-medium">{csvFileName}</span>
                </p>
                <button type="button" onClick={resetImport} className="text-xs text-ink-soft underline">
                  Choose a different file
                </button>
              </div>

              <ErrorBanner message={importError} />

              {previewLoading && <p className="mt-4 text-sm text-ink-soft">Checking your file&hellip;</p>}

              {preview && !commitResult && (
                <div className="mt-4">
                  <div className="flex gap-4">
                    <div className="rounded-lg bg-success/10 px-4 py-2.5">
                      <p className="text-xs text-ink-soft">Ready to import</p>
                      <p className="font-display text-xl font-semibold text-success">{preview.validCount}</p>
                    </div>
                    <div className="rounded-lg bg-danger/10 px-4 py-2.5">
                      <p className="text-xs text-ink-soft">Will be skipped</p>
                      <p className="font-display text-xl font-semibold text-danger">{preview.invalidCount}</p>
                    </div>
                  </div>

                  {preview.invalidRows.length > 0 && (
                    <div className="mt-4 max-h-56 overflow-y-auto rounded-lg border border-border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-indigo-100/60">
                          <tr className="text-left">
                            <th className="px-3 py-2 font-medium text-ink-soft">Row</th>
                            <th className="px-3 py-2 font-medium text-ink-soft">Problem</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.invalidRows.map((row) => (
                            <tr key={row.rowNumber} className="border-t border-border">
                              <td className="px-3 py-2 font-mono text-ink-soft">{row.rowNumber || '\u2014'}</td>
                              <td className="px-3 py-2 text-danger">{row.errors.join(' ')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {preview.validCount > 0 ? (
                    <div className="mt-5 flex items-center gap-3">
                      <Button onClick={handleConfirmImport} loading={commitLoading}>
                        Import {preview.validCount} product{preview.validCount === 1 ? '' : 's'}
                      </Button>
                      <span className="text-xs text-ink-soft">
                        into <strong>{branches.find((b) => b.id === branchId)?.name}</strong>
                      </span>
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-ink-soft">
                      No rows are valid to import &mdash; fix the file and choose it again.
                    </p>
                  )}
                </div>
              )}

              {commitResult && (
                <div className="mt-4 rounded-lg border border-success/30 bg-success/5 px-4 py-4">
                  <p className="text-sm text-ink">
                    Imported <strong>{commitResult.imported}</strong> product
                    {commitResult.imported === 1 ? '' : 's'}
                    {commitResult.skipped > 0 && (
                      <> &mdash; {commitResult.skipped} row{commitResult.skipped === 1 ? '' : 's'} skipped</>
                    )}
                    .
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      resetImport();
                      setShowImport(false);
                    }}
                    className="mt-3 text-sm text-indigo underline underline-offset-2"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
          )}
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
                  No products yet &mdash; add your first one above, or import a CSV.
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
