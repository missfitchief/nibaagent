import "server-only";
import { db } from "./db/client";
import { eventLogs } from "./db/schema";
import { resolvePlatform } from "./platform";

/** Resolved Meta app credentials (DB platform setting → env fallback). */
export async function metaCreds(): Promise<{ appId: string; appSecret: string }> {
  const [appId, appSecret] = await Promise.all([resolvePlatform("META_APP_ID"), resolvePlatform("META_APP_SECRET")]);
  return { appId: appId.value, appSecret: appSecret.value };
}

/** Resolved OAuth redirect URI from the resolved APP_URL. */
export async function resolvedRedirectUri(): Promise<string> {
  const appUrl = (await resolvePlatform("APP_URL")).value || "http://localhost:3000";
  return `${appUrl.replace(/\/$/, "")}/api/meta/callback`;
}

/**
 * Graph API helpers for the OAuth connect flow. Battle-tested details baked
 * in from a real StarLight/NibaChat integration:
 *  - /me/accounts can return [] even when pages WERE granted (task-based page
 *    access quirk) → fall back to debug_token granular_scopes target_ids and
 *    query each page id directly.
 *  - a Page token derived from a LONG-LIVED user token does not expire.
 *  - page must be subscribed to the app (subscribed_apps) or no webhooks fire.
 */

const G = "https://graph.facebook.com/v25.0";

export const META_OAUTH_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "pages_manage_metadata",
  "pages_messaging",
  "instagram_basic",
  "instagram_manage_messages"
].join(",");

export interface GraphPage {
  id: string;
  name: string;
  access_token: string;
  instagram_business_account?: { id: string };
}

async function gfetch<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { "User-Agent": "NibaChatAgent/1.0" } });
  const body = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || body.error) throw new Error(body.error?.message ?? `graph_${res.status}`);
  return body;
}

export async function exchangeCodeForToken(code: string, redirectUri: string): Promise<string> {
  const { appId, appSecret } = await metaCreds();
  const data = await gfetch<{ access_token: string }>(
    `${G}/oauth/access_token?client_id=${appId}&client_secret=${appSecret}&redirect_uri=${encodeURIComponent(redirectUri)}&code=${encodeURIComponent(code)}`
  );
  return data.access_token;
}

export async function toLongLivedToken(shortToken: string): Promise<string> {
  const { appId, appSecret } = await metaCreds();
  const data = await gfetch<{ access_token: string }>(
    `${G}/oauth/access_token?grant_type=fb_exchange_token&client_id=${appId}&client_secret=${appSecret}&fb_exchange_token=${encodeURIComponent(shortToken)}`
  );
  return data.access_token;
}

export async function fetchGrantedPages(userToken: string): Promise<GraphPage[]> {
  const { appId, appSecret } = await metaCreds();
  // Primary: /me/accounts
  const accounts = await gfetch<{ data?: GraphPage[] }>(
    `${G}/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(userToken)}`
  );
  if (accounts.data?.length) return accounts.data;

  // Fallback: granular scopes → direct page queries (task-access quirk).
  const appToken = `${appId}|${appSecret}`;
  const debug = await gfetch<{ data?: { granular_scopes?: Array<{ scope: string; target_ids?: string[] }> } }>(
    `${G}/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(appToken)}`
  );
  const ids = new Set<string>();
  for (const s of debug.data?.granular_scopes ?? []) {
    if (s.scope.startsWith("pages_")) for (const id of s.target_ids ?? []) ids.add(id);
  }
  const pages: GraphPage[] = [];
  for (const id of ids) {
    try {
      pages.push(
        await gfetch<GraphPage>(
          `${G}/${id}?fields=id,name,access_token,instagram_business_account&access_token=${encodeURIComponent(userToken)}`
        )
      );
    } catch {
      /* skip inaccessible page */
    }
  }
  return pages;
}

export async function subscribePageToApp(pageId: string, pageToken: string): Promise<void> {
  const res = await fetch(`${G}/${pageId}/subscribed_apps`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ subscribed_fields: "messages,messaging_postbacks", access_token: pageToken })
  });
  const body = (await res.json()) as { success?: boolean; error?: { message: string } };
  if (!body.success) throw new Error(body.error?.message ?? "subscribed_apps failed");
}

export async function logEvent(
  businessId: string | null,
  level: "info" | "warn" | "error",
  area: string,
  message: string,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  try {
    await db().insert(eventLogs).values({ businessId, level, area, message: message.slice(0, 500), metadata });
  } catch {
    console.error(`[eventlog-fallback] ${level} ${area}: ${message}`);
  }
}
