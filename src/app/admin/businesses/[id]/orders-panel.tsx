"use client";

import { useActionState, useState } from "react";
import { bulkDeleteOrdersAction, deleteOrderAction, setOrderStatusAction, type BulkDeleteState } from "@/lib/actions/inbox";
import { setOrderNoteAction } from "@/lib/actions/danger";
import type { orders } from "@/lib/db/schema";

type OrderRow = typeof orders.$inferSelect;

const STATUSES = ["new", "confirmed", "shipped", "done", "cancelled"] as const;

export function AdminOrdersPanel({ businessId, rows }: { businessId: string; rows: OrderRow[] }) {
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
    <div>
      <div className="mb-2 flex items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-[var(--ink-soft)]">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300" />
          Select all
        </label>
      </div>

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

      <div className="space-y-2">
        {rows.map((o) => (
          <div key={o.id} className="rounded-lg border border-[var(--card-border)] bg-white/60 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-2 font-medium">
                <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} className="h-4 w-4 rounded border-slate-300" />
                {o.customerName || "—"} · {o.city || "—"}
              </label>
              <form action={setOrderStatusAction} className="flex items-center gap-1.5">
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="id" value={o.id} />
                <select name="status" defaultValue={o.status} className="rounded-lg border border-[var(--card-border)] bg-white px-2 py-1 text-xs">
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <button className="rounded-lg border border-[var(--card-border)] bg-white px-2 py-1 text-xs">Set</button>
              </form>
              <form action={deleteOrderAction}>
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="id" value={o.id} />
                <button className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 hover:bg-rose-100">Delete</button>
              </form>
            </div>
            <p className="mt-1 text-[var(--ink-soft)]">{o.orderText || "—"}</p>
            <form action={setOrderNoteAction} className="mt-2 flex gap-1.5">
              <input type="hidden" name="businessId" value={businessId} />
              <input type="hidden" name="orderId" value={o.id} />
              <input name="note" defaultValue={o.internalNote} placeholder="Internal note" className="w-full rounded-lg border border-[var(--card-border)] bg-white px-2 py-1 text-xs" />
              <button className="rounded-lg border border-[var(--card-border)] bg-white px-2 py-1 text-xs">Save note</button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
