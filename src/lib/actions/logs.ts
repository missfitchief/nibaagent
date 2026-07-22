"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { eventLogs } from "../db/schema";
import { requireAdmin, requireBusiness } from "../auth/guards";

const ResolveInput = z.object({ businessId: z.string().uuid(), logId: z.string().uuid() });

/** Owner/admin marks one error log reviewed (sets resolved_at). Business-scoped. */
export async function resolveEventLogAction(formData: FormData): Promise<void> {
  const parsed = ResolveInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { business } = await requireBusiness(parsed.data.businessId, "admin");
  await db()
    .update(eventLogs)
    .set({ resolvedAt: new Date() })
    .where(and(eq(eventLogs.id, parsed.data.logId), eq(eventLogs.businessId, business.id)));
  revalidatePath(`/admin/businesses/${business.id}`);
  revalidatePath("/app/logs");
}

/**
 * Platform admin bulk-clears the error backlog (e.g. a wave of stale errors
 * from a bug that's already fixed, or an old n8n workflow that's been
 * decommissioned). Does NOT stop new errors from reappearing — anything that
 * fails again after this runs shows up fresh on the Control center, which is
 * the point: a clean slate so the unresolved count means "since I last
 * checked," not "since the beginning of time."
 */
export async function resolveAllErrorLogsAction(): Promise<void> {
  await requireAdmin();
  await db()
    .update(eventLogs)
    .set({ resolvedAt: new Date() })
    .where(and(eq(eventLogs.level, "error"), isNull(eventLogs.resolvedAt)));
  revalidatePath("/admin");
  revalidatePath("/admin/logs");
}
