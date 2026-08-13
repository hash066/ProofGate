import { describe, expect, it } from "vitest";

import { prepareJsonCommand, prepareReelDeliveryCommand } from "../../apps/proofgate-cli/src/commands";

describe("ProofGate CLI acceptance commands", () => {
  it("prepares a private WhatsApp reel delivery without embedding credentials", () => {
    expect(prepareReelDeliveryCommand({
      reelId: "reel-1",
      renderedAssetId: "reel-output-1",
      recipientWaId: "919876543210",
      caption: "Your approved reel",
    })).toEqual({
      path: "/internal/reel-delivery",
      method: "POST",
      contentType: "application/json",
      body: JSON.stringify({ reelId: "reel-1", renderedAssetId: "reel-output-1", recipientWaId: "919876543210", caption: "Your approved reel" }),
    });
  });

  it("rejects an invalid recipient before any provider request", () => {
    expect(() => prepareReelDeliveryCommand({ reelId: "reel-1", renderedAssetId: "asset-1", recipientWaId: "+91 bad" })).toThrow("recipient");
  });

  it("prepares persistent policy and decision commands", async () => {
    const policy = {
      schemaVersion: 1,
      policyId: "policy-fast-1",
      merchantId: "merchant-demo",
      ownerWaIdHash: "a".repeat(64),
      mode: "fast_pilot",
      autonomousActions: ["create_candidate", "run_verification"],
      createdAt: 1_754_000_000_000,
    };
    await expect(prepareJsonCommand("policy", policy)).resolves.toMatchObject({ path: "/internal/policy", method: "POST" });
    await expect(prepareJsonCommand("decision", {
      schemaVersion: 1, merchantId: "merchant-demo", action: "create_candidate",
    })).resolves.toMatchObject({ path: "/internal/decision", method: "POST" });
  });

  it("prepares one immutable three-variant social campaign approval", async () => {
    const prepared = await prepareJsonCommand("social-campaign", {
      schemaVersion: 1,
      campaignId: "launch-cakes-1",
      merchantId: "merchant-demo",
      platform: "instagram",
      objective: "engagement",
      variants: [
        { variantId: "variant-hook", changedDimension: "hook", hypothesis: "Question hook wins", reelAssetId: "reel-hook", caption: "Which cake?", scheduledAt: 1_754_000_000_000 },
        { variantId: "variant-cover", changedDimension: "cover", hypothesis: "Cover wins", reelAssetId: "reel-cover", caption: "Fresh cakes", scheduledAt: 1_754_086_400_000 },
        { variantId: "variant-cta", changedDimension: "cta", hypothesis: "CTA wins", reelAssetId: "reel-cta", caption: "Message to order", scheduledAt: 1_754_172_800_000 },
      ],
      metricCheckpointsHours: [2, 24, 72], explorationRate: 0.2, createdAt: 1_753_900_000_000,
    });
    expect(prepared).toMatchObject({ path: "/internal/social-campaign", method: "POST" });
    expect(JSON.parse(String(prepared.body)).scopeHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
