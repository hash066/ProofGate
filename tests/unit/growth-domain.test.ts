import { describe, expect, it } from "vitest";

import {
  ApprovalSchema,
  BusinessBriefSchema,
  CallOutcomeSchema,
  LeadConsentSchema,
  ReelPlanSchema,
  SiteSpecV2Schema,
  initialBakerySiteSpec,
} from "../../packages/domain/src/growth";
import { createCallBatch, evaluateCallBatch } from "../../packages/release-policy/src/growth-policy";

describe("WhatsApp growth domain", () => {
  it("validates the production-shaped bakery brief and site spec", () => {
    const brief = BusinessBriefSchema.parse({
      schemaVersion: 1,
      merchantId: "merchant-demo",
      ownerWaIdHash: "a".repeat(64),
      businessType: "home_bakery",
      businessName: "Maya's Oven",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      description: "Small-batch celebration cakes baked to order.",
      orderWhatsAppNumber: "+919876543210",
      fulfillmentArea: "Bengaluru",
      leadTime: "Order at least 48 hours ahead.",
      suppliedClaims: ["Eggless options available on request."],
      catalog: [{ name: "Chocolate Truffle", priceMinor: 120000, currency: "INR", imageAssetId: "cake-1" }],
    });
    expect(brief.businessType).toBe("home_bakery");
    expect(SiteSpecV2Schema.parse(initialBakerySiteSpec).catalog).toHaveLength(3);
    expect(() => BusinessBriefSchema.parse({ ...brief, customerApiKey: "must-not-be-collected" })).toThrow();
    expect(() => SiteSpecV2Schema.parse({ ...initialBakerySiteSpec, customerAccessToken: "must-not-be-collected" })).toThrow();
  });

  it("accepts common SME types without forcing a bakery workflow", () => {
    for (const businessType of ["tailor", "tutor", "salon", "home_service", "retailer", "other"] as const) {
      const brief = BusinessBriefSchema.parse({
        schemaVersion: 1,
        merchantId: `merchant-${businessType.replace("_", "-")}`,
        ownerWaIdHash: "d".repeat(64),
        businessType,
        businessName: "Local Business",
        timezone: "Asia/Kolkata",
        locale: "en-IN",
        description: "A trusted local service for nearby customers.",
        orderWhatsAppNumber: "+919876543210",
        fulfillmentArea: "Bengaluru",
        leadTime: "Message to confirm availability.",
        suppliedClaims: [],
        catalog: [{ name: "Consultation", currency: "INR", imageAssetId: "service-1" }],
      });
      expect(brief.businessType).toBe(businessType);
      expect(brief.catalog[0].priceMinor).toBeUndefined();
    }
  });

  it("accepts only India and US leads with purpose-specific evidence", () => {
    const lead = LeadConsentSchema.parse({
      schemaVersion: 1,
      leadId: "lead-1",
      phoneCiphertext: "kms:v1:ciphertext",
      phoneHash: "b".repeat(64),
      country: "IN",
      purpose: "ai_qualification_call",
      source: "merchant_supplied_form",
      evidenceHash: "c".repeat(64),
      grantedAt: 1_800_000_000_000,
      localTimezone: "Asia/Kolkata",
      callWindow: { startHour: 10, endHour: 18 },
    });
    expect(lead.country).toBe("IN");
    expect(() => LeadConsentSchema.parse({ ...lead, country: "GB" })).toThrow();
    expect(() => LeadConsentSchema.parse({ ...lead, evidenceHash: "" })).toThrow();
  });

  it("binds approval to an immutable call-batch scope", async () => {
    const batch = await createCallBatch({
      batchId: "batch-1",
      merchantId: "merchant-demo",
      leadIds: ["lead-2", "lead-1"],
      countries: ["US", "IN"],
      scriptVersion: "qualifier-v1",
      earliestAt: 1_800_000_000_000,
      latestAt: 1_800_003_600_000,
      maxAttemptsPerLead: 1,
      costCapUsd: 5,
    });
    const approval = ApprovalSchema.parse({
      schemaVersion: 1,
      approvalId: "approval-1",
      merchantId: "merchant-demo",
      type: "call_batch",
      scopeHash: batch.scopeHash,
      ownerWaIdHash: "d".repeat(64),
      providerMessageId: "wamid.1",
      decision: "approved",
      decidedAt: 1_800_000_000_100,
      expiresAt: 1_800_086_400_000,
    });
    expect(await evaluateCallBatch(batch, approval, 1_800_000_000_200)).toEqual({ allowed: true });
    expect(await evaluateCallBatch({ ...batch, costCapUsd: 6 }, approval, 1_800_000_000_200)).toEqual({
      allowed: false,
      reason: "BATCH_SCOPE_CHANGED",
    });
    expect(await evaluateCallBatch(batch, approval, approval.expiresAt + 1)).toEqual({
      allowed: false,
      reason: "APPROVAL_EXPIRED",
    });
  });

  it("keeps call outcomes and reel plans structured", () => {
    expect(CallOutcomeSchema.parse({
      schemaVersion: 1,
      callId: "call-1",
      batchId: "batch-1",
      leadId: "lead-1",
      recordingConsent: "granted",
      outcome: "qualified",
      interest: "high",
      timing: "this_week",
      product: "Chocolate Truffle",
      objection: "none",
      followUpRequested: true,
      doNotCall: false,
      costUsd: 0.42,
      artifactRef: "s3://proofgate-calls/call-1.wav",
      completedAt: 1_800_000_000_000,
    }).outcome).toBe("qualified");

    expect(ReelPlanSchema.parse({
      schemaVersion: 1,
      reelId: "reel-1",
      merchantId: "merchant-demo",
      angle: "Freshly baked for the moments worth celebrating",
      hook: "Your celebration deserves more than a generic cake.",
      scenes: [
        { assetId: "cake-1", overlay: "Small-batch celebration cakes", durationMs: 5000 },
        { assetId: "cake-2", overlay: "Made to order in Bengaluru", durationMs: 5000 },
        { assetId: "cake-3", overlay: "Order 48 hours ahead", durationMs: 5000 },
      ],
      voiceover: "Celebration cakes, baked in small batches and made for you.",
      caption: "Made to order. Message us on WhatsApp.",
      cta: "Order on WhatsApp",
      claims: ["Made to order"],
      status: "approved",
    }).scenes).toHaveLength(3);
  });
});
