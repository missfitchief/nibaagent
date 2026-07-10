import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { resolvePlatform } from "@/lib/platform";
import { logEvent } from "@/lib/meta";

/**
 * Meta Data Deletion Callback (required for app review).
 * Meta POSTs a `signed_request`; we verify its HMAC-SHA256 signature against the
 * resolved Meta App Secret (DB platform setting → env), record a deletion task,
 * and return the status URL + a unique confirmation code per Meta's contract.
 * If the app secret isn't configured or the signature is invalid, we reject —
 * we never fabricate a success.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSignedRequest(signedRequest: string, secret: string): { user_id?: string } | null {
  const [sigB64, payloadB64] = signedRequest.split(".");
  if (!sigB64 || !payloadB64) return null;
  const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const signed = String(form?.get("signed_request") ?? "");
  const [{ value: secret }, { value: appUrlRaw }] = await Promise.all([
    resolvePlatform("META_APP_SECRET"),
    resolvePlatform("APP_URL")
  ]);
  if (!signed || !secret) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });
  const data = parseSignedRequest(signed, secret);
  if (!data) return NextResponse.json({ error: "invalid signed_request" }, { status: 400 });

  const code = crypto.randomUUID().slice(0, 8);
  await logEvent(null, "info", "data_deletion", `Meta data deletion request for user ${data.user_id ?? "unknown"} (code ${code})`, {
    userId: data.user_id ?? "",
    code
  });
  const appUrl = (appUrlRaw || "https://nibaagent.vercel.app").replace(/\/$/, "");
  return NextResponse.json({
    url: `${appUrl}/user-data-deletion?code=${code}`,
    confirmation_code: code
  });
}
