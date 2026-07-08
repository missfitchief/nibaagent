"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "../db/client";
import { adminAuditLogs, eventLogs, SECRET_KINDS } from "../db/schema";
import { canManageSecrets, requireBusiness } from "../auth/guards";
import { deleteBusinessSecret, setBusinessSecret } from "../secrets";
import type { ActionState } from "./business";

const SetSecret = z.object({
  businessId: z.string().uuid(),
  kind: z.enum(SECRET_KINDS),
  value: z.string().min(1).max(500)
});

export async function setSecretAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = SetSecret.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Enter a value." };
  const { user, business, role } = await requireBusiness(parsed.data.businessId);
  if (!canManageSecrets(role)) return { error: "Only the business owner or an admin can manage keys." };

  // Light shape validation — a wrong-looking key is a common support ticket.
  if (parsed.data.kind === "openai_api_key" && !/^sk-/.test(parsed.data.value.trim())) {
    return { error: "That doesn't look like an OpenAI key (should start with sk-)." };
  }

  await setBusinessSecret(business.id, parsed.data.kind, parsed.data.value);
  await db().insert(eventLogs).values({
    businessId: business.id,
    level: "info",
    area: "token",
    message: `secret set: ${parsed.data.kind}`,
    metadata: { by: user.email } // value NEVER logged
  });
  if (user.role === "admin") {
    await db().insert(adminAuditLogs).values({
      adminUserId: user.userId,
      action: "secret.set",
      targetType: "business",
      targetId: business.id,
      metadata: { kind: parsed.data.kind }
    });
  }
  revalidatePath("/app/settings");
  revalidatePath(`/admin/businesses/${business.id}`);
  return { ok: true };
}

const DeleteSecret = z.object({ businessId: z.string().uuid(), kind: z.enum(SECRET_KINDS) });

export async function deleteSecretAction(formData: FormData): Promise<void> {
  const parsed = DeleteSecret.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;
  const { user, business, role } = await requireBusiness(parsed.data.businessId);
  if (!canManageSecrets(role)) return;
  await deleteBusinessSecret(business.id, parsed.data.kind);
  await db().insert(eventLogs).values({
    businessId: business.id,
    level: "info",
    area: "token",
    message: `secret removed: ${parsed.data.kind}`,
    metadata: { by: user.email }
  });
  revalidatePath("/app/settings");
  revalidatePath(`/admin/businesses/${business.id}`);
}
