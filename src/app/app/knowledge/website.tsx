"use client";

import { useActionState } from "react";
import { ingestWebsiteAction, type ImportState } from "@/lib/actions/import";
import { Button, Card, ErrorNote, Input } from "@/components/ui";

export function WebsiteKnowledgeForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState<ImportState, FormData>(ingestWebsiteAction, {});
  return (
    <Card>
      <h2 className="font-semibold">Read knowledge from your website</h2>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">
        Paste your site URL. We read the homepage plus About, FAQ, delivery, payment, returns and contact pages, and store them
        as business knowledge. Product prices/stock still come from the Products table (authoritative) — website text is used for
        the rest.
      </p>
      <form action={formAction} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="hidden" name="businessId" value={businessId} />
        <Input name="url" placeholder="https://your-shop.com" autoComplete="off" className="flex-1" />
        <Button type="submit" disabled={pending}>
          {pending ? "Reading…" : "Read website"}
        </Button>
      </form>
      <ErrorNote>{state.error}</ErrorNote>
      {state.ok && state.website && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Read {state.website.created + state.website.updated} page(s):{" "}
          {state.website.pages.map((p) => p.type).join(", ")}
        </div>
      )}
    </Card>
  );
}
