import Link from "next/link";
import { LOG_SOURCES, type BusinessLogRow } from "@/lib/logs";
import { resolveEventLogAction } from "@/lib/actions/logs";
import { Badge, Card } from "@/components/ui";

/**
 * Per-business logs with source filter tabs, expandable sanitized metadata and a
 * resolve action for errors. Server component — filters via ?logSource= on
 * `basePath`; resolve is a plain form action (no client JS). Never cross-tenant:
 * the caller passes already-scoped rows.
 */
export function BusinessLogs({
  businessId,
  logs,
  basePath,
  activeSource,
  canResolve
}: {
  businessId: string;
  logs: BusinessLogRow[];
  basePath: string;
  activeSource: string;
  canResolve: boolean;
}) {
  const href = (key: string) => `${basePath}${basePath.includes("?") ? "&" : "?"}logSource=${key}`;
  const fmt = (d: Date) => new Date(d).toISOString().replace("T", " ").slice(0, 16);
  const levelTone = (l: string) => (l === "error" ? "error" : l === "warn" ? "warn" : "neutral");

  return (
    <Card>
      <h2 className="font-semibold">Logovi i greške</h2>
      <p className="mt-1 text-xs text-[var(--ink-soft)]">Događaji ovog biznisa. Detalji su sanitizovani — ne sadrže tokene ni API ključeve.</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {LOG_SOURCES.map((s) => (
          <Link
            key={s.key}
            href={href(s.key)}
            className={
              "rounded-full border px-3 py-1 text-xs " +
              (s.key === activeSource
                ? "border-sky-300 bg-sky-50 font-medium text-sky-700"
                : "border-[var(--card-border)] text-[var(--ink-soft)] hover:bg-slate-50")
            }
          >
            {s.label}
          </Link>
        ))}
      </div>

      <div className="mt-3 space-y-2">
        {logs.length === 0 && <p className="py-4 text-center text-sm text-[var(--ink-soft)]">Nema logova za ovaj filter.</p>}
        {logs.map((l) => (
          <div key={l.id} className="rounded-lg border border-[var(--card-border)] bg-white/60 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge tone={levelTone(l.level)}>{l.level}</Badge>
                <span className="text-xs text-[var(--ink-soft)]">{l.area}</span>
                {l.resolvedAt && <span className="text-xs text-emerald-600">rešeno ✓</span>}
              </div>
              <span className="text-xs text-[var(--ink-soft)]">{fmt(l.createdAt)}</span>
            </div>
            <p className="mt-1">{l.message}</p>
            {l.metadata != null && Object.keys(l.metadata as Record<string, unknown>).length > 0 ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs text-sky-600">Detalji</summary>
                <pre className="mt-1 overflow-x-auto rounded bg-slate-50 p-2 text-xs">{JSON.stringify(l.metadata, null, 2)}</pre>
              </details>
            ) : null}
            {canResolve && l.level === "error" && !l.resolvedAt && (
              <form action={resolveEventLogAction} className="mt-2">
                <input type="hidden" name="businessId" value={businessId} />
                <input type="hidden" name="logId" value={l.id} />
                <button className="text-xs text-emerald-700 underline hover:text-emerald-800">Označi kao rešeno</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
