"use client";

import { useActionState, useState } from "react";
import { bulkDeleteOrdersAction, deleteOrderAction, setOrderStatusAction, type BulkDeleteState } from "@/lib/actions/inbox";
import { Badge } from "@/components/ui";
import type { orders } from "@/lib/db/schema";

type OrderRow = typeof orders.$inferSelect;

const STATUSES = ["new", "confirmed", "shipped", "done", "cancelled"] as const;

export function OrdersTable({ businessId, rows }: { businessId: string; rows: OrderRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkState, bulkAction, bulkPending] = useActionState<BulkDeleteState, FormData>(bulkDeleteOrdersAction, {});
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((o) => o.id)));

  return (
    <div className="overflow-x-auto">
      {selected.size > 0 && (
        <form
          action={bulkAction}
          className="mb-3 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2"
          onSubmit={(e) => {
            if (!confirm(`Permanently delete ${selected.size} order${selected.size === 1 ? "" : "s"}? This cannot be undone.`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="ids" value={JSON.stringify([...selected])} />
          <span className="text-sm text-rose-700">{selected.size} selected</span>
          <button
            type="submit"
            disabled={bulkPending}
            className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-60"
          >
            {bulkPending ? "Deleting…" : "Delete selected"}
          </button>
        </form>
      )}
      {bulkState.error && <p className="mb-2 text-sm text-rose-600">{bulkState.error}</p>}
      {bulkState.ok && (
        <p className="mb-2 text-sm text-emerald-700">
          Deleted {bulkState.deleted} order{bulkState.deleted === 1 ? "" : "s"} — permanently removed.
        </p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-[var(--ink-soft)]">
            <th className="py-2 pr-2">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300" />
            </th>
            <th className="py-2 pr-4">Date</th>
            <th className="py-2 pr-4">Customer</th>
            <th className="py-2 pr-4">Phone</th>
            <th className="py-2 pr-4">Address</th>
            <th className="py-2 pr-4">Order</th>
            <th className="py-2 pr-4">Sheet</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((o) => (
            <tr key={o.id} className="border-t border-[var(--card-border)] align-top">
              <td className="py-2 pr-2">
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 rounded border-slate-300" />
              </td>
              <td className="whitespace-nowrap py-2 pr-4">{o.createdAt.toISOString().slice(0, 10)}</td>
              <td className="py-2 pr-4">{o.customerName || "—"}</td>
              <td className="py-2 pr-4">{o.phone || "—"}</td>
              <td className="py-2 pr-4">{[o.streetAndNumber || o.address, o.city, o.postalCode].filter(Boolean).join(", ") || "—"}</td>
              <td className="max-w-[18rem] py-2 pr-4">
                <span className="line-clamp-2">{o.orderText || "—"}</span>
              </td>
              <td className="py-2 pr-4">
                {o.googleSheetSynced ? <Badge tone="ok">synced</Badge> : o.sheetSyncError ? <Badge tone="error">failed</Badge> : <Badge>db only</Badge>}
              </td>
              <td className="py-2 pr-4">
                <form action={setOrderStatusAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="id" value={o.id} />
                  <select name="status" defaultValue={o.status} className="rounded-lg border border-[var(--card-border)] bg-white/80 px-2 py-1 text-xs">
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button className="rounded-lg border border-[var(--card-border)] bg-white/60 px-2 py-1 text-xs hover:bg-white">Set</button>
                </form>
              </td>
              <td className="py-2 pr-4">
                <form action={deleteOrderAction}>
                  <input type="hidden" name="businessId" value={businessId} />
                  <input type="hidden" name="id" value={o.id} />
                  <button className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100">Delete</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
