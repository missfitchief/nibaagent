import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "./db/client";
import { eventLogs } from "./db/schema";

/**
 * Log query helpers + filter definitions. NOT a "use server" module (it exports
 * objects, which server-action files may not) — the resolve action lives in
 * lib/actions/logs.ts.
 */
export interface LogSource {
  key: string;
  label: string;
  /** event_logs.area values that map to this filter. */
  areas?: string[];
  /** true → filter by level='error' instead of area. */
  errorsOnly?: boolean;
}

/** Filter tabs shown above a business's logs. `key` goes in the ?logSource= query. */
export const LOG_SOURCES: LogSource[] = [
  { key: "all", label: "Sve" },
  { key: "errors", label: "Samo greške", errorsOnly: true },
  { key: "ai", label: "AI", areas: ["ai_reply"] },
  { key: "meta", label: "Meta", areas: ["meta_oauth"] },
  { key: "webhook", label: "Webhook", areas: ["webhook_subscribe", "webhook_receive"] },
  { key: "n8n", label: "n8n", areas: ["n8n_sync"] },
  { key: "product_import", label: "Uvoz proizvoda", areas: ["product_import"] },
  { key: "knowledge_import", label: "Uvoz znanja", areas: ["knowledge_import"] },
  { key: "telegram", label: "Telegram", areas: ["notification"] },
  { key: "admin", label: "Admin", areas: ["admin"] }
];

export interface BusinessLogRow {
  id: string;
  level: "info" | "warn" | "error";
  area: string;
  eventType: string;
  message: string;
  metadata: unknown;
  resolvedAt: Date | null;
  createdAt: Date;
}

/** Business-scoped log query with an optional source filter. Never cross-tenant. */
export async function listBusinessLogs(businessId: string, sourceKey = "all", limit = 100): Promise<BusinessLogRow[]> {
  const src = LOG_SOURCES.find((s) => s.key === sourceKey) ?? LOG_SOURCES[0];
  const rows = await db()
    .select()
    .from(eventLogs)
    .where(eq(eventLogs.businessId, businessId))
    .orderBy(desc(eventLogs.createdAt))
    .limit(400);
  const filtered = rows.filter((r) => {
    if (src.errorsOnly) return r.level === "error";
    if (src.areas) return src.areas.includes(r.area);
    return true;
  });
  return filtered.slice(0, limit) as BusinessLogRow[];
}
