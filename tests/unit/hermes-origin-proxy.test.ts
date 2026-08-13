import { describe, expect, it, vi } from "vitest";

import { createHermesOriginProxy } from "../../apps/hermes-origin-proxy/src/proxy";

const secret = "proofgate-origin-secret-that-is-long-enough";

describe("Hermes origin proxy", () => {
  it("rejects missing or incorrect Worker credentials without touching Hermes", async () => {
    const upstreamFetch = vi.fn();
    const proxy = createHermesOriginProxy({ proxySecret: secret, upstreamFetch });

    const missing = await proxy(new Request("https://origin.example/whatsapp/webhook", { method: "POST", body: "{}" }));
    const incorrect = await proxy(new Request("https://origin.example/whatsapp/webhook", {
      method: "POST",
      headers: { "x-proofgate-proxy": `${secret}-wrong` },
      body: "{}",
    }));

    expect(missing.status).toBe(401);
    expect(incorrect.status).toBe(401);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("forwards the exact Meta body and signature only after Worker authentication", async () => {
    const raw = new TextEncoder().encode('{"entry":[{"id":"preserve-me"}]}');
    const upstreamFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const bytes = new Uint8Array(init?.body as ArrayBuffer);
      expect(bytes).toEqual(raw);
      expect(new Headers(init?.headers).get("x-hub-signature-256")).toBe(`sha256=${"a".repeat(64)}`);
      expect(new Headers(init?.headers).get("x-proofgate-proxy")).toBeNull();
      return new Response("accepted", { status: 202, headers: { "content-type": "text/plain" } });
    });
    const proxy = createHermesOriginProxy({ proxySecret: secret, upstreamFetch: upstreamFetch as typeof fetch });

    const response = await proxy(new Request("https://origin.example/whatsapp/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-proofgate-proxy": secret,
        "x-hub-signature-256": `sha256=${"a".repeat(64)}`,
      },
      body: raw,
    }));

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("accepted");
    expect(upstreamFetch).toHaveBeenCalledOnce();
  });

  it("rejects oversized bodies and non-webhook routes", async () => {
    const upstreamFetch = vi.fn();
    const proxy = createHermesOriginProxy({ proxySecret: secret, upstreamFetch, maxBodyBytes: 8 });
    const oversized = await proxy(new Request("https://origin.example/whatsapp/webhook", {
      method: "POST",
      headers: { "x-proofgate-proxy": secret },
      body: "123456789",
    }));
    const unknown = await proxy(new Request("https://origin.example/admin"));

    expect(oversized.status).toBe(413);
    expect(unknown.status).toBe(404);
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("exposes a minimal unauthenticated health check for the named tunnel", async () => {
    const proxy = createHermesOriginProxy({ proxySecret: secret, upstreamFetch: vi.fn() });
    const response = await proxy(new Request("https://origin.example/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "proofgate-hermes-origin", status: "ok" });
  });
});
