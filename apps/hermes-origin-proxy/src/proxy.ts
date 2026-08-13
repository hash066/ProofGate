import { timingSafeEqual } from "node:crypto";

export type HermesOriginProxyOptions = {
  proxySecret: string;
  upstreamUrl?: string;
  upstreamFetch?: typeof fetch;
  maxBodyBytes?: number;
  timeoutMs?: number;
};

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function createHermesOriginProxy(options: HermesOriginProxyOptions): (request: Request) => Promise<Response> {
  if (options.proxySecret.length < 32) throw new Error("HERMES_PROXY_SECRET must contain at least 32 characters");
  const upstreamUrl = new URL(options.upstreamUrl ?? "http://127.0.0.1:8090/whatsapp/webhook");
  if (upstreamUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(upstreamUrl.hostname)) {
    throw new Error("Hermes upstream must be loopback HTTP");
  }
  const upstreamFetch = options.upstreamFetch ?? fetch;
  const maxBodyBytes = options.maxBodyBytes ?? 2 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 15_000;

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ service: "proofgate-hermes-origin", status: "ok" });
    }
    if (request.method !== "POST" || url.pathname !== "/whatsapp/webhook") {
      return new Response("Not found", { status: 404 });
    }

    const providedSecret = request.headers.get("x-proofgate-proxy") ?? "";
    if (!constantTimeEqual(providedSecret, options.proxySecret)) {
      return new Response("Unauthorized", { status: 401 });
    }

    const declaredLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
      return new Response("Payload too large", { status: 413 });
    }
    const body = new Uint8Array(await request.arrayBuffer());
    if (body.byteLength > maxBodyBytes) return new Response("Payload too large", { status: 413 });

    const forwardedHeaders = new Headers({
      "content-type": request.headers.get("content-type") ?? "application/json",
    });
    const metaSignature = request.headers.get("x-hub-signature-256");
    if (metaSignature) forwardedHeaders.set("x-hub-signature-256", metaSignature);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const upstream = await upstreamFetch(upstreamUrl, {
        method: "POST",
        headers: forwardedHeaders,
        body: body.buffer,
        signal: controller.signal,
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "text/plain; charset=utf-8" },
      });
    } catch (error) {
      if (controller.signal.aborted) return new Response("Hermes timeout", { status: 504 });
      return new Response("Hermes unavailable", { status: 502 });
    } finally {
      clearTimeout(timeout);
    }
  };
}
