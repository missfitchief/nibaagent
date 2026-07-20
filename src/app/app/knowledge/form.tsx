"use client";

import { useActionState, useState } from "react";
import { createKnowledgeAction } from "@/lib/actions/knowledge";
import type { ActionState } from "@/lib/actions/business";
import { Button, Card, ErrorNote, Input, Label, Textarea } from "@/components/ui";

export function KnowledgeForm({ businessId, prefillTitle = "", unansweredId = "" }: { businessId: string; prefillTitle?: string; unansweredId?: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createKnowledgeAction, {});
  const [type, setType] = useState("faq");
  return (
    <Card className="glass-strong">
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="businessId" value={businessId} />
        {unansweredId && <input type="hidden" name="uq" value={unansweredId} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="type">Type</Label>
            <select
              id="type"
              name="type"
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full rounded-xl border border-[var(--card-border)] bg-white/80 px-3.5 py-2.5 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            >
              <option value="faq">FAQ (question & answer)</option>
              <option value="products">Products & prices</option>
              <option value="manual">Business info / rules</option>
              <option value="url">Website URL</option>
            </select>
          </div>
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" name="title" required defaultValue={prefillTitle} placeholder={type === "faq" ? "What is the delivery price?" : "e.g. Product list"} />
          </div>
        </div>
        {type === "url" ? (
          <div>
            <Label htmlFor="sourceUrl">Website URL</Label>
            <Input id="sourceUrl" name="sourceUrl" type="url" placeholder="https://yourshop.com" />
            <p className="mt-1 text-xs text-[var(--ink-soft)]">
              We extract public product names, prices, delivery info and FAQs from the page.
            </p>
          </div>
        ) : (
          <div>
            <Label htmlFor="content">{type === "faq" ? "Answer" : "Content"}</Label>
            <Textarea
              id="content"
              name="content"
              rows={4}
              placeholder={type === "faq" ? "Delivery is 5 KM, free over 50 KM." : "Paste product names, prices, policies…"}
            />
          </div>
        )}
        <ErrorNote>{state.error}</ErrorNote>
        {state.ok && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Added ✓</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add knowledge"}
        </Button>
      </form>
    </Card>
  );
}
