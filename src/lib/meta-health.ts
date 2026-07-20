import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import { metaConnections } from "./db/schema";
import { decryptToken } from "./crypto";
import { GRAPH_API_BASE, logEvent } from "./meta";

/**
 * Meta token health check (daily cron). For every non-disconnected connection
 * we decrypt the page token and probe Graph /me:
 *   - success                 → status = "active"
 *   - OAuth error (code 190 / invalid token) → status = "error" + event log
 *     (the dashboard shows a reconnect banner for status "error")
 *   - anything else (network/5xx/rate limit) → status untouched, warn logged
 * The Graph call sits behind an injectable seam so tests never hit the network.
 */

export interface MetaHealthProbe {
  ok: boolean;
  /** true only for a definitive OAuth/invalid-token failure (safe to mark error). */
  invalidToken?: boolean;
  error?: string;
}

export type MetaHealthFetch = (token: string) => Promise<MetaHealthProbe>;

export interface MetaHealthResult {
  checked: number;
  active: number;
  errored: number;
  skipped: number;
}

const defaultFetchMe: MetaHealthFetch = async (token) => {
  try {
    const res = await fetch(`${GRAPH_API_BASE}/me?access_token=${encodeURIComponent(token)}`);
    const body = (await res.json()) as { id?: string; error?: { code?: number; message?: string } };
    if (body.error) {
      const msg = body.error.message ?? "graph error";
      const invalid = body.error.code === 190 || /invalid (oauth )?(access )?token|session.*expired|token.*expired/i.test(msg);
      return { ok: false, invalidToken: invalid, error: msg };
    }
    return { ok: res.ok, error: res.ok ? undefined : `graph_${res.status}` };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
};

function pageToken(conn: { encryptedPageAccessToken: string }): string {
  try {
    return decryptToken(conn.encryptedPageAccessToken);
  } catch {
    return "";
  }
}

export async function checkMetaConnectionHealth(fetchMe: MetaHealthFetch = defaultFetchMe): Promise<MetaHealthResult> {
  const d = db();
  const rows = await d.select().from(metaConnections);
  const out: MetaHealthResult = { checked: 0, active: 0, errored: 0, skipped: 0 };

  for (const conn of rows) {
    if (conn.status === "disconnected") {
      out.skipped += 1;
      continue;
    }
    out.checked += 1;
    const token = pageToken(conn);
    if (!token) {
      if (conn.status !== "error") {
        await d.update(metaConnections).set({ status: "error", updatedAt: new Date() }).where(eq(metaConnections.id, conn.id));
        await logEvent(conn.businessId, "error", "meta_oauth", `Token health: no token stored for page ${conn.pageId} — status=error`);
      }
      out.errored += 1;
      continue;
    }

    const r = await fetchMe(token);
    if (r.ok) {
      if (conn.status !== "active") {
        await d.update(metaConnections).set({ status: "active", updatedAt: new Date() }).where(eq(metaConnections.id, conn.id));
        await logEvent(conn.businessId, "info", "meta_oauth", `Token health: page ${conn.pageId} healthy — status=active`);
      }
      out.active += 1;
    } else if (r.invalidToken) {
      if (conn.status !== "error") {
        await d.update(metaConnections).set({ status: "error", updatedAt: new Date() }).where(eq(metaConnections.id, conn.id));
        await logEvent(conn.businessId, "error", "meta_oauth", `Meta token for page ${conn.pageId} is invalid/expired (OAuth code 190) — status=error; reconnect required`);
      }
      out.errored += 1;
    } else {
      // Inconclusive (network/5xx/rate limit): never flip status on a maybe.
      await logEvent(conn.businessId, "warn", "meta_oauth", `Token health check inconclusive for page ${conn.pageId}: ${(r.error ?? "unknown").slice(0, 200)}`);
      out.skipped += 1;
    }
  }
  return out;
}
