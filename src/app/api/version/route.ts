import { NextResponse } from "next/server";
import { VERSION } from "@/lib/version";

/** Public build stamp — lets anyone confirm which commit is live. No secrets. */
export const dynamic = "force-static";

export function GET() {
  return NextResponse.json(VERSION);
}
