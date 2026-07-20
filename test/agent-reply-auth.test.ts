import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "../src/app/api/agent/reply/route";

/**
 * The public engine endpoint must FAIL CLOSED: no AGENT_WEBHOOK_SECRET (or a
 * wrong header) → 401 before any tenant work happens. The engine itself is
 * never reached in these tests (the gate rejects first), so no DB is needed
 * beyond what the module import touches.
 */

function req(headers: Record<string, string>, body: unknown): NextRequest {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
    json: async () => body
  } as unknown as NextRequest;
}

const VALID_BODY = { client_id: "some-tenant", message: "zdravo" };

describe("agent reply endpoint — fail-closed secret gate", () => {
  const saved = process.env.AGENT_WEBHOOK_SECRET;
  beforeEach(() => {
    delete process.env.AGENT_WEBHOOK_SECRET;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.AGENT_WEBHOOK_SECRET;
    else process.env.AGENT_WEBHOOK_SECRET = saved;
  });

  it("401 when AGENT_WEBHOOK_SECRET is unset (fail closed, not open)", async () => {
    const res = await POST(req({}, VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("401 when the header does not match the configured secret", async () => {
    process.env.AGENT_WEBHOOK_SECRET = "s3cr3t-test-value";
    const res = await POST(req({ "x-agent-secret": "wrong" }, VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("401 when the header is missing entirely", async () => {
    process.env.AGENT_WEBHOOK_SECRET = "s3cr3t-test-value";
    const res = await POST(req({}, VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("passes the gate with the correct secret (400 here = payload validation, not auth)", async () => {
    process.env.AGENT_WEBHOOK_SECRET = "s3cr3t-test-value";
    const res = await POST(req({ "x-agent-secret": "s3cr3t-test-value" }, { nope: true }));
    expect(res.status).toBe(400); // reached payload validation → auth passed
  });
});
