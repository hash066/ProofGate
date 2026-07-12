import { describe, expect, it } from "vitest";

import worker, { createApp } from "../../apps/edge-runtime/src/index";

describe("Spike A edge runtime", () => {
  it("serves the validated booking page with an immutable manifest hash", async () => {
    const response = await worker.request("https://proofgate.example/s/saturday-sessions");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(response.headers.get("x-proofgate-spec-hash")).toMatch(/^[a-f0-9]{64}$/);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(html).toContain('data-pg="primary-cta"');
  });

  it("presents and records an external acknowledgment through an injected evidence boundary", async () => {
    const acknowledgedTokens: string[] = [];
    const app = createApp({
      acknowledge: async (token) => {
        acknowledgedTokens.push(token);
        return { inserted: true, passportState: "green" as const };
      },
    });

    const page = await app.request("/ack?token=signed-booking-token");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('data-pg="ack-button"');

    const response = await app.request("/ack", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: "signed-booking-token" }),
    });

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-pg="ack-confirmation"');
    expect(acknowledgedTokens).toEqual(["signed-booking-token"]);
  });
});
