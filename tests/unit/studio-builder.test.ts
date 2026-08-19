import { describe, expect, it } from "vitest";

import { buildStudioReelPlan, buildStudioWebsite, MissingStudioFactsError } from "../../packages/domain/src/studio-builder";

const owner = {
  merchantId: "merchant-1234567890abcdef",
  ownerWaIdHash: "a".repeat(64),
};

describe("Studio website builder", () => {
  it("infers the business type and emits only a validated SiteSpec from supplied facts and assets", () => {
    const result = buildStudioWebsite({
      projectId: "project-tailor-1",
      intent: "website",
      businessName: "Maya Studio",
      description: "Custom blouse stitching and alterations in Bengaluru.",
      siteStyle: "portfolio",
      referenceAssetIds: ["merchant-asset-front", "merchant-asset-detail"],
      orderWhatsAppNumber: "+919876543210",
      fulfillmentArea: "Bengaluru",
      leadTime: "Ready in 5–7 days",
      timezone: "Asia/Kolkata",
      suppliedClaims: ["Custom stitching", "Alterations available"],
      offerings: [
        { name: "Custom blouse", description: "Made to your measurements", priceMinor: 150000, currency: "INR" },
        { name: "Alterations", description: "Fit corrections for supplied garments", currency: "INR" },
      ],
    }, owner);

    expect(result.brief.businessType).toBe("tailor");
    expect(result.spec.businessType).toBe("tailor");
    expect(result.spec.theme.layout).toBe("portfolio");
    expect(result.spec.siteId).toMatch(/^maya-studio-[a-z0-9]{6}$/);
    expect(result.spec.catalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "custom-blouse", imageAssetId: "merchant-asset-front", priceMinor: 150000 }),
      expect.objectContaining({ id: "alterations", imageAssetId: "merchant-asset-detail" }),
    ]));
    expect(result.spec.suppliedClaims).toEqual(["Custom stitching", "Alterations available"]);
    expect(JSON.stringify(result.spec)).not.toContain("<script");
  });

  it("returns one consolidated list of missing facts instead of inventing business data", () => {
    expect(() => buildStudioWebsite({
      projectId: "project-draft-1",
      intent: "website",
      businessName: "Draft Business",
      description: "A local service business",
      siteStyle: "minimal",
      referenceAssetIds: [],
    }, owner)).toThrowError(MissingStudioFactsError);

    try {
      buildStudioWebsite({
        projectId: "project-draft-1",
        intent: "website",
        businessName: "Draft Business",
        description: "A local service business",
        siteStyle: "minimal",
        referenceAssetIds: [],
      }, owner);
    } catch (error) {
      expect(error).toBeInstanceOf(MissingStudioFactsError);
      expect((error as MissingStudioFactsError).missing).toEqual([
        "orderWhatsAppNumber",
        "fulfillmentArea",
        "leadTime",
        "offerings",
        "referenceAssetIds",
      ]);
    }
  });

  it("creates one approval-bound 15-second reel plan from supplied layers and photos", () => {
    const result = buildStudioReelPlan({
      projectId: "project-tailor-1", intent: "reels", businessName: "Maya Studio",
      description: "Custom blouse stitching in Bengaluru", reelTemplate: "split_explainer",
      referenceAssetIds: ["merchant-photo-one", "merchant-photo-two"], siteAssetIds: ["merchant-photo-one", "merchant-photo-two"],
      suppliedClaims: ["Custom stitching"],
      layerOverrides: { hook: "See the fit change", proof: "Measured and stitched locally", cta: "Message for an appointment", accent: "#fe5b3a", pacing: "fast" },
    }, owner);
    expect(result.plan).toMatchObject({ merchantId: owner.merchantId, angle: "Process + proof", hook: "See the fit change", status: "draft" });
    expect(result.plan.scenes).toHaveLength(3);
    expect(result.plan.scenes.reduce((sum, scene) => sum + scene.durationMs, 0)).toBe(15_000);
    expect(new Set(result.plan.scenes.map((scene) => scene.assetId))).toEqual(new Set(["merchant-photo-one", "merchant-photo-two"]));
    expect(result.suggestions).toHaveLength(3);
  });
});
