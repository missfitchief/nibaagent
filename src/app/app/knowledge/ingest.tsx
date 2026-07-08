"use client";

import { useActionState } from "react";
import { ingestTextAction, type IngestState } from "@/lib/actions/ingest";
import { Button, Card, ErrorNote, Input, Label, Textarea } from "@/components/ui";

export function IngestPanel({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState<IngestState, FormData>(ingestTextAction, {});
  return (
    <Card>
      <h2 className="font-semibold">Import old chats / notes / .txt</h2>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">
        Paste a chat export, CSV or notes — or upload a plain <strong>.txt</strong> file. Personal data (emails, phones,
        order/tracking numbers, addresses, marked names) is redacted before anything is stored. We extract FAQ candidates
        automatically. <em>PDF/DOCX upload is coming soon.</em>
      </p>
      <form action={formAction} className="mt-3 space-y-2">
        <input type="hidden" name="businessId" value={businessId} />
        <div>
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" defaultValue="Imported knowledge" />
        </div>
        <Textarea name="content" rows={6} placeholder="Paste transcript / CSV / notes here…" />
        <div>
          <Label htmlFor="file">…or upload a .txt file</Label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".txt,text/plain"
            className="block w-full text-sm text-[var(--ink-soft)] file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm hover:file:bg-slate-200"
          />
        </div>
        <ErrorNote>{state.error}</ErrorNote>
        {state.summary && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Imported {state.summary.charsIn.toLocaleString()} chars · redacted{" "}
            {Object.values(state.summary.redactions).reduce((a, b) => a + b, 0)} PII items · {state.summary.faqCandidates} FAQ
            candidates · {state.summary.chunksStored} chunks stored.
          </p>
        )}
        <Button type="submit" disabled={pending}>
          {pending ? "Importing…" : "Import & sanitize"}
        </Button>
      </form>
    </Card>
  );
}
