"use client";

import { useActionState, useState } from "react";
import { scanProductsAction, importProductsAction, type ScanState, type ImportState } from "@/lib/actions/import";
import type { ScannedProduct } from "@/lib/importer";
import { Badge, Button, Card, ErrorNote, Input } from "@/components/ui";

function stockBadge(s: ScannedProduct["stockStatus"]) {
  if (s === "available") return <Badge tone="ok">available</Badge>;
  if (s === "unavailable") return <Badge tone="warn">unavailable</Badge>;
  return <Badge tone="info">unknown</Badge>;
}

/**
 * Preview + selection table. Mounts fresh (via `key` on a new scan) with every
 * product selected — so we avoid setState-in-effect entirely.
 */
function PreviewTable({ businessId, origin, products }: { businessId: string; origin: string; products: ScannedProduct[] }) {
  const [importState, importAction, importing] = useActionState<ImportState, FormData>(importProductsAction, {});
  const [selected, setSelected] = useState<Set<number>>(() => new Set(products.map((_, i) => i)));
  const toggle = (i: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  const allSelected = products.length > 0 && selected.size === products.length;
  const selectedProducts = products.filter((_, i) => selected.has(i));

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium">
          {products.length} products found · {selected.size} selected
        </span>
        <button
          type="button"
          onClick={() => setSelected(allSelected ? new Set() : new Set(products.map((_, i) => i)))}
          className="text-xs text-sky-600 underline"
        >
          {allSelected ? "Deselect all" : "Select all"}
        </button>
      </div>

      <div className="max-h-80 overflow-auto rounded-lg border border-[var(--card-border)]">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-slate-50 text-xs text-[var(--ink-soft)]">
            <tr>
              <th className="p-2"> </th>
              <th className="p-2">Title</th>
              <th className="p-2">Price</th>
              <th className="p-2">Stock</th>
              <th className="p-2">SKU</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={i} className="border-t border-[var(--card-border)]">
                <td className="p-2">
                  <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} className="h-4 w-4 rounded border-slate-300" />
                </td>
                <td className="p-2">
                  <div className="font-medium">{p.title}</div>
                  {p.url && <div className="truncate text-[11px] text-[var(--ink-soft)]">{p.url}</div>}
                </td>
                <td className="p-2 whitespace-nowrap">{p.price == null ? "—" : `${p.price} ${p.currency ?? ""}`}</td>
                <td className="p-2">{stockBadge(p.stockStatus)}</td>
                <td className="p-2 text-xs">{p.sku || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form action={importAction} className="mt-3 space-y-2">
        <input type="hidden" name="businessId" value={businessId} />
        <input type="hidden" name="products" value={JSON.stringify(selectedProducts)} />
        <input type="hidden" name="websiteUrl" value={origin} />
        <label className="flex items-center gap-2 text-sm">
          <input name="ingestWebsite" type="checkbox" value="true" defaultChecked className="h-4 w-4 rounded border-slate-300" />
          Also read website info (About, FAQ, delivery, payment, returns, contact)
        </label>
        <Button type="submit" disabled={importing || selected.size === 0}>
          {importing ? "Importing…" : `Import ${selected.size} product${selected.size === 1 ? "" : "s"}`}
        </Button>
      </form>

      <ErrorNote>{importState.error}</ErrorNote>
      {importState.ok && importState.outcome && (
        <p className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Imported ✓ — {importState.outcome.created} new, {importState.outcome.updated} updated
          {importState.website ? `, website pages: ${importState.website.created + importState.website.updated}` : ""}.
        </p>
      )}
    </div>
  );
}

export function ImportPanel({ businessId }: { businessId: string }) {
  const [scanState, scanAction, scanning] = useActionState<ScanState, FormData>(scanProductsAction, {});
  const products = scanState.scan?.products ?? [];
  const origin = scanState.scan?.origin ?? "";
  // Remount the preview table (fresh "all selected" state) whenever a new scan lands.
  const scanKey = products.length ? `${origin}:${products.length}:${products[0]?.url ?? products[0]?.title}` : "empty";

  return (
    <Card>
      <h2 className="font-semibold">Import from a shop URL</h2>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">
        Paste your webshop link (Shopify, WooCommerce, or any site with product data). We&apos;ll scan it and let you preview before importing.
      </p>

      <form action={scanAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="businessId" value={businessId} />
        <Input name="url" placeholder="https://your-shop.com" autoComplete="off" className="flex-1" />
        <Button type="submit" disabled={scanning}>
          {scanning ? "Scanning…" : "Scan"}
        </Button>
      </form>
      <ErrorNote>{scanState.error}</ErrorNote>

      {scanState.scan && (
        <div className="mt-2 text-xs text-[var(--ink-soft)]">
          {scanState.scan.source && (
            <span className="mr-2">
              Detected: <strong>{scanState.scan.source}</strong>
            </span>
          )}
          {scanState.scan.log.map((l, i) => (
            <div key={i}>· {l}</div>
          ))}
        </div>
      )}

      {products.length > 0 && <PreviewTable key={scanKey} businessId={businessId} origin={origin} products={products} />}
    </Card>
  );
}
