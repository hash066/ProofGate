import { describe, expect, it, vi } from "vitest";

import { runCallGuardianOnce } from "../../apps/call-guardian/src/worker";

describe("AWS call guardian", () => {
  it("asks the Worker to dispatch only an approved consented call batch", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({ authorization: `Bearer ${"s".repeat(64)}` });
      expect(JSON.parse(String(init?.body))).toEqual({ kind: "calls" });
      return Response.json({ claimed: true, batchId: "batch-self-test", calls: [{ leadId: "lead-self-test", callId: "call-1" }] }, { status: 201 });
    });
    await expect(runCallGuardianOnce({ adminUrl: "https://axcas.example", serviceSecret: "s".repeat(64), fetcher }))
      .resolves.toEqual({ claimed: true, batchId: "batch-self-test", calls: [{ leadId: "lead-self-test", callId: "call-1" }] });
  });

  it("fails closed for invalid configuration and provider errors", async () => {
    await expect(runCallGuardianOnce({ adminUrl: "http://axcas.example", serviceSecret: "short" })).rejects.toThrow("configuration");
    await expect(runCallGuardianOnce({
      adminUrl: "https://axcas.example", serviceSecret: "s".repeat(64), fetcher: vi.fn(async () => new Response("blocked", { status: 503 })),
    })).rejects.toThrow("HTTP 503");
  });
});
