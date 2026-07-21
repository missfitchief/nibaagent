"use client";

import { useActionState, useEffect, useState } from "react";
import { deleteKnowledgeAction, updateKnowledgeAction } from "@/lib/actions/knowledge";
import type { ActionState } from "@/lib/actions/business";
import { Badge, Button, Card, ErrorNote, Input, Textarea } from "@/components/ui";

export function KnowledgeEditRow({
  businessId,
  id,
  type,
  title,
  content,
  sourceUrl
}: {
  businessId: string;
  id: string;
  type: string;
  title: string;
  content: string;
  sourceUrl: string;
}) {
  const [editing, setEditing] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateKnowledgeAction, {});

  // Server props (title/content) refresh via revalidatePath once the save
  // lands — leave edit mode so the row shows the new saved copy.
  useEffect(() => {
    if (state.ok) setEditing(false);
  }, [state.ok]);

  if (editing) {
    return (
      <Card>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="id" value={id} />
          <div className="flex items-center gap-2">
            <Badge tone="info">{type}</Badge>
            <Input name="title" defaultValue={title} required className="flex-1" />
          </div>
          <Textarea name="content" defaultValue={content} rows={5} placeholder="Answer / content…" />
          <ErrorNote>{state.error}</ErrorNote>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    );
  }

  return (
    <Card className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Badge tone="info">{type}</Badge>
          <span className="font-medium">{title}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-[var(--ink-soft)]">{content || sourceUrl || "—"}</p>
        {state.ok && <p className="mt-1 text-sm text-emerald-700">Saved ✓</p>}
      </div>
      <div className="flex shrink-0 gap-1">
        <button onClick={() => setEditing(true)} className="rounded-lg px-3 py-1.5 text-sm text-sky-600 hover:bg-sky-50">
          Edit
        </button>
        <form action={deleteKnowledgeAction}>
          <input type="hidden" name="businessId" value={businessId} />
          <input type="hidden" name="id" value={id} />
          <button className="rounded-lg px-3 py-1.5 text-sm text-rose-600 hover:bg-rose-50">Remove</button>
        </form>
      </div>
    </Card>
  );
}
