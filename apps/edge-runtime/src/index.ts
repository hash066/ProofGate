import { Hono } from "hono";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { initialSpikeSiteSpec, SiteSpecSchema } from "../../../packages/domain/src/site-spec";
import { renderSite } from "../../../packages/renderer/src/render-site";

type Bindings = { CONVEX_URL?: string };
type AcknowledgmentResult = { inserted: boolean; passportState: "amber" | "green" };
type EvidenceBoundary = {
  acknowledge: (token: string, convexUrl?: string) => Promise<AcknowledgmentResult>;
};

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const liveEvidenceBoundary: EvidenceBoundary = {
  acknowledge: async (token, convexUrl) => {
    if (!convexUrl) throw new Error("CONVEX_URL is not configured");
    const client = new ConvexHttpClient(convexUrl);
    return client.action(api.oracle.acknowledgeBooking, { token });
  },
};

export function createApp(evidenceBoundary: EvidenceBoundary = liveEvidenceBoundary): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();
  app.get("/", (context) => context.redirect("/s/saturday-sessions", 302));
  app.get("/health", (context) => context.json({ service: "proofgate-edge", phase: "spike-b", status: "ok" }));
  app.get("/s/:slug", async (context) => {
    if (context.req.param("slug") !== initialSpikeSiteSpec.siteId) return context.notFound();
    const spec = SiteSpecSchema.parse(initialSpikeSiteSpec);
    const specHash = await sha256(canonicalize(spec));
    return context.html(renderSite(spec), 200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-proofgate-spec-hash": specHash,
      "x-proofgate-version-id": "spike-a-v1",
    });
  });
  app.get("/ack", (context) => {
    const token = context.req.query("token");
    if (!token) return context.text("Missing acknowledgment capability", 400);
    return context.html(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Booking acknowledgment</title></head><body><main><h1>Saturday Sessions booking</h1><p>Please confirm that you received the request for exactly two seats.</p><form method="post" action="/ack" data-pg="ack-form"><input type="hidden" name="token" value="${token.replace(/[&<>"']/g, "")}"><button type="submit" data-pg="ack-button">Acknowledge two-seat booking</button></form></main></body></html>`, 200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
    });
  });
  app.post("/ack", async (context) => {
    const body = await context.req.parseBody();
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return context.text("Missing acknowledgment capability", 400);
    try {
      const result = await evidenceBoundary.acknowledge(token, context.env?.CONVEX_URL);
      return context.html(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Acknowledged</title></head><body><main data-pg="ack-confirmation"><h1>Acknowledgment recorded</h1><p>Passport state: ${result.passportState}</p></main></body></html>`, 200, {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        "referrer-policy": "no-referrer",
      });
    } catch {
      return context.text("The acknowledgment capability is invalid or expired", 403);
    }
  });
  app.get("/proof/:slug", (context) =>
    context.json({
      site: context.req.param("slug"),
      state: "gray",
      statement: "Development spike only. No external witness or production certification exists.",
    }),
  );
  return app;
}

export default createApp();
