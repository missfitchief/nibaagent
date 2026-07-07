"use client";

import { useActionState } from "react";
import { testBotAction, type TestState } from "@/lib/actions/tools";
import { Badge, Button, Card, ErrorNote, Input } from "@/components/ui";

export function TestBotForm({ businessId }: { businessId: string }) {
  const [state, formAction, pending] = useActionState<TestState, FormData>(testBotAction, {});
  const r = state.result;
  return (
    <div className="space-y-4">
      <Card className="glass-strong">
        <form action={formAction} className="flex gap-2">
          <input type="hidden" name="businessId" value={businessId} />
          <Input name="message" required placeholder='Try: "koliko kosta dostava?" or "zelim da narucim" or "operater"' />
          <Button type="submit" disabled={pending}>
            {pending ? "…" : "Send"}
          </Button>
        </form>
        <ErrorNote>{state.error}</ErrorNote>
      </Card>

      {r && (
        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={r.intent === "handoff" ? "warn" : r.intent === "no_ai" ? "neutral" : "ok"}>intent: {r.intent}</Badge>
            <Badge tone="info">model: {r.modelUsed}</Badge>
            {r.aiCalled && <Badge tone="info">{r.tokenEstimate} tokens · €{r.costEstimateEur}</Badge>}
            {r.handoffTriggered && <Badge tone="warn">handoff would trigger</Badge>}
            {r.orderTriggered && <Badge tone="ok">order collection would start</Badge>}
          </div>
          {r.reply ? (
            <div className="bubble-in mt-4 max-w-md rounded-2xl rounded-bl-sm border border-[var(--card-border)] bg-white/80 px-4 py-3 text-sm">
              {r.reply}
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--ink-soft)]">{r.note ?? "No reply produced."}</p>
          )}
          {r.knowledgeUsed.length > 0 && (
            <p className="mt-3 text-xs text-[var(--ink-soft)]">Knowledge considered: {r.knowledgeUsed.join(" · ")}</p>
          )}
        </Card>
      )}
    </div>
  );
}
