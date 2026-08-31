import { describe, expect, it, vi } from "vitest";

import { executeBridgeRequest, parseBridgeRequest } from "../../apps/axcas-tool-bridge/src/bridge";

const context = {
  platform: "whatsapp_cloud" as const,
  userId: "919876543210",
  messageId: "wamid.demo-message",
};

const intake = {
  schemaVersion: 1,
  businessType: "home_bakery",
  businessName: "Golden Crust",
  timezone: "Asia/Kolkata",
  locale: "en-IN",
  description: "Fresh sourdough baked in Hubli.",
  orderWhatsAppNumber: "+919876543210",
  fulfillmentArea: "Hubli",
  leadTime: "24 hours",
  suppliedClaims: [],
  catalog: [{ name: "Sourdough loaf", priceMinor: 18000, currency: "INR", imageAssetId: "asset-bread-1" }],
  projectId: "project-whatsapp-linked-1",
  projectIntent: "both",
};

describe("Axcas typed tool bridge", () => {
  it("accepts only the explicit merchant action vocabulary", () => {
    expect(() => parseBridgeRequest({ action: "guardian", context, payload: {} })).toThrow();
    expect(() => parseBridgeRequest({ action: "deliver_reel", context, payload: {} })).toThrow();
  });

  it("binds the authenticated gateway context without placing credentials in arguments", async () => {
    const submit = vi.fn(async (command, env) => {
      expect(env.HERMES_SESSION_PLATFORM).toBe("whatsapp_cloud");
      expect(env.HERMES_SESSION_USER_ID).toBe("919876543210");
      expect(env.HERMES_SESSION_MESSAGE_ID).toBe("wamid.demo-message");
      expect(env.PROOFGATE_SERVICE_SECRET).toBe("server-only-secret-material-12345");
      expect(JSON.parse(command.body ?? "{}")).toMatchObject({
        projectId: "project-whatsapp-linked-1",
        projectIntent: "both",
      });
      return { accepted: true, merchantId: "merchant-opaque" };
    });

    const result = await executeBridgeRequest(
      { action: "intake", context, payload: intake },
      submit,
      {
        PROOFGATE_ADMIN_URL: "https://example.workers.dev",
        PROOFGATE_SERVICE_SECRET: "server-only-secret-material-12345",
      },
    );

    expect(result).toMatchObject({ status: "accepted", merchantId: "merchant-opaque" });
    expect(JSON.stringify(result)).not.toContain("server-only-secret");
  });

  it("maps provider and credential errors to one customer-safe response", async () => {
    const submit = vi.fn(async () => {
      throw new Error("ProofGate admin request failed (401): PROOFGATE_SERVICE_SECRET=do-not-leak");
    });
    const result = await executeBridgeRequest(
      { action: "intake", context, payload: intake },
      submit,
      {
        PROOFGATE_ADMIN_URL: "https://example.workers.dev",
        PROOFGATE_SERVICE_SECRET: "server-only-secret-material-12345",
      },
    );

    expect(result.status).toBe("temporarily_unavailable");
    expect(JSON.stringify(result)).not.toMatch(/PROOFGATE|secret|401|provider/i);
  });
});
