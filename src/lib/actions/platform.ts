"use server";

import { revalidatePath } from "next/cache";
import { db } from "../db/client";
import { adminAuditLogs } from "../db/schema";
import { requireAdmin } from "../auth/guards";
import { PLATFORM_KEYS, setPlatform, deletePlatform, type PlatformKey } from "../platform";
import type { ActionState } from "./business";

function isPlatformKey(k: string): k is PlatformKey {
  return Object.prototype.hasOwnProperty.call(PLATFORM_KEYS, k);
}

/**
 * Save one or more platform settings from the admin UI. Only non-empty values
 * are written (leaving a secret field blank keeps the existing value). Secret
 * values are encrypted at rest inside setPlatform; we never log the plaintext,
 * only which keys changed.
 */
export async function setPlatformAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const admin = await requireAdmin();
  const changed: string[] = [];
  for (const [rawKey, rawVal] of formData.entries()) {
    if (!isPlatformKey(rawKey)) continue;
    const value = String(rawVal ?? "").trim();
    if (!value) continue; // blank = leave as-is (don't wipe a saved secret)
    await setPlatform(rawKey, value);
    changed.push(rawKey);
  }
  if (changed.length) {
    await db().insert(adminAuditLogs).values({
      adminUserId: admin.userId,
      action: "platform.settings.update",
      targetType: "platform",
      targetId: "platform",
      metadata: { keys: changed } // key names only — never the values
    });
  }
  revalidatePath("/admin/settings");
  return { ok: true };
}

/**
 * Clear a single platform setting (falls back to env, or unset). Plain form
 * action (invoked via a submit button's formAction) so it doesn't require a
 * nested <form>.
 */
export async function deletePlatformAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const key = String(formData.get("key") ?? "");
  if (!isPlatformKey(key)) return;
  await deletePlatform(key);
  await db().insert(adminAuditLogs).values({
    adminUserId: admin.userId,
    action: "platform.settings.clear",
    targetType: "platform",
    targetId: "platform",
    metadata: { key }
  });
  revalidatePath("/admin/settings");
}
