import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { logEvent } from "@/lib/meta";

/**
 * Meta Data Deletion Callback (required for app review).
 * Meta POSTs a signed_request; we verify it, log a deletion task, and return
 * the status URL + confirmation code per Meta's contract.
 */

function parseSignedRequest(signedRequest: string, secret: string): { user_id?: string } | null {
  const [sigB64, payloadB64] = signedRequest.split(".");
  if (!sigB64 || !payloadB64) return null;
  const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (expected !== sigB64) return null;
  try {
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signed = String(form?.get("signed_request") ?? "");
  const e = env();
  const data = signed && e.META_APP_SECRET ? parseSignedRequest(signed, e.META_APP_SECRET) : null;
  if (!data) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });

  const code = crypto.randomUUID().slice(0, 8);
  await logEvent(null, "info", "data_deletion", `Meta data deletion request for user ${data.user_id ?? "unknown"} (code ${code})`, {
    userId: data.user_id ?? "",
    code
  });
  return NextResponse.json({
    url: `${e.APP_URL.replace(/\/$/, "")}/legal/data-deletion?code=${code}`,
    confirmation_code: code
  });
}
