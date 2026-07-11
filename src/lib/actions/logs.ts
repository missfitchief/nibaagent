"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { eventLogs } from "../db/schema";
import { requireBusiness } from "../auth/guards";

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
