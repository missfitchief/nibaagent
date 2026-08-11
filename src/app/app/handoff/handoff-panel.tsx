"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { bulkDeleteConversationsAction, resolveHandoffAction, type BulkDeleteState } from "@/lib/actions/inbox";
import { Badge, Card } from "@/components/ui";
import type { handoffs } from "@/lib/db/schema";

type HandoffRow = typeof handoffs.$inferSelect;
export interface HandoffListItem {
  h: HandoffRow;
  channel: string | null;
  customer: string | null;
  sender: string | null;
}

/**
 * Shared panel for /app/handoff and the admin per-business Handoffs tab.
 * "Select all" / bulk-delete removes the underlying CONVERSATION (and its
 * messages) — a handoff record with nothing to show for it isn't useful on
 * its own, so deleting the chat is what actually clears these out.
 */
export function HandoffPanel({
  businessId,
  rows,
  detailBasePath
}: {
  businessId: string;
  rows: HandoffListItem[];
  /** "view chat" links are `${detailBasePath}/${conversationId}` — a Server Component
   *  can't pass a function prop across to a Client Component. */
  detailBasePath: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkState, bulkAction, bulkPending] = useActionState<BulkDeleteState, FormData>(bulkDeleteConversationsAction, {});
  const selectable = rows.filter((r) => r.h.conversationId);
  const allSelected = selectable.length > 0 && selected.size === selectable.length;

  const toggle = (conversationId: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(conversationId)) next.delete(conversationId);
      else next.add(conversationId);
      return next;
    });

  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(selectable.map((r) => r.h.conversationId!)));

  return (
    <div>
      {selectable.length > 0 && (
        <div className="mb-2 flex items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 text-[var(--ink-soft)]">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300" />
            Select all
          </label>
        </div>
      )}

      {selected.size > 0 && (
        <form
          action={bulkAction}
          className="mb-3 flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2"
          onSubmit={(e) => {
            if (
              !confirm(`Permanently delete ${selected.size} conversation${selected.size === 1 ? "" : "s"} behind these handoffs? This cannot be undone.`)
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

      <div className="space-y-3">
        {rows.map(({ h, channel, customer, sender }) => (
          <Card key={h.id} className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2">
              {h.conversationId && (
                <input
                  type="checkbox"
                  checked={selected.has(h.conversationId)}
                  onChange={() => toggle(h.conversationId!)}
                  className="mt-1 h-4 w-4 rounded border-slate-300"
                />
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={h.status === "open" ? "warn" : "ok"}>{h.status}</Badge>
                  <Badge tone="info">{channel ?? "—"}</Badge>
                  <span className="font-medium">{customer || sender || "Customer"}</span>
                </div>
                <p className="mt-1 text-sm text-[var(--ink-soft)]">
                  {h.reason || (h.triggerWord ? `Trigger word: “${h.triggerWord}”` : "Handoff requested")} ·{" "}
                  {h.createdAt.toISOString().replace("T", " ").slice(0, 16)}
                  {h.conversationId && (
                    <>
                      {" · "}
                      <Link href={`${detailBasePath}/${h.conversationId}`} className="text-sky-600 hover:underline">
                        View chat →
                      </Link>
                    </>
                  )}
                </p>
              </div>
            </div>
            {h.status === "open" && (
              <form action={resolveHandoffAction}>
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="id" value={h.id} />
                <button className="btn-primary rounded-xl px-4 py-2 text-sm font-medium">Mark resolved — bot resumes</button>
              </form>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
