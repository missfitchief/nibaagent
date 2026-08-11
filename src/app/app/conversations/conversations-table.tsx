"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { bulkDeleteConversationsAction, type BulkDeleteState } from "@/lib/actions/inbox";
import { Badge } from "@/components/ui";
import type { conversations } from "@/lib/db/schema";

type ConversationRow = typeof conversations.$inferSelect;

/** Shared table for /app/conversations and the admin per-business Conversations tab. */
export function ConversationsTable({
  businessId,
  rows,
  detailBasePath
}: {
  businessId: string;
  rows: ConversationRow[];
  /** "view chat" links are `${detailBasePath}/${id}` — app and admin point at different routes,
   *  and a Server Component can't pass a function prop across to a Client Component. */
  detailBasePath: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkState, bulkAction, bulkPending] = useActionState<BulkDeleteState, FormData>(bulkDeleteConversationsAction, {});
  const allSelected = rows.length > 0 && selected.size === rows.length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(rows.map((c) => c.id)));

  return (
    <div className="overflow-x-auto">
      {selected.size > 0 && (
        <form
          action={bulkAction}
          className="mb-3 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2"
          onSubmit={(e) => {
            if (
              !confirm(
                `Permanently delete ${selected.size} conversation${selected.size === 1 ? "" : "s"} and all their messages? This cannot be undone.`
              )
            ) {
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
          Deleted {bulkState.deleted} conversation{bulkState.deleted === 1 ? "" : "s"} — permanently removed.
        </p>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-[var(--ink-soft)]">
            <th className="py-2 pr-2">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300" />
            </th>
            <th className="py-2 pr-4">Customer</th>
            <th className="py-2 pr-4">Channel</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Last activity</th>
            <th className="py-2 pr-4"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id} className="border-t border-[var(--card-border)]">
              <td className="py-2 pr-2">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="h-4 w-4 rounded border-slate-300" />
              </td>
              <td className="py-2 pr-4">{c.customerName || c.senderId}</td>
              <td className="py-2 pr-4">{c.channel}</td>
              <td className="py-2 pr-4">
                <Badge tone={c.status === "handoff" ? "warn" : c.status === "closed" ? "neutral" : "ok"}>{c.status}</Badge>
              </td>
              <td className="py-2 pr-4">{c.lastMessageAt.toISOString().replace("T", " ").slice(0, 16)}</td>
              <td className="py-2 pr-4">
                <Link href={`${detailBasePath}/${c.id}`} className="text-sky-600 hover:underline">
                  Open →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
