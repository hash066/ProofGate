import { describe, expect, it } from "vitest";

import { applyPromotion, evaluatePromotion, type PromotionFacts } from "../../packages/release-policy/src/release-authority";

const passingFacts: PromotionFacts = {
  candidateVersionId: "version-2",
  candidateSpecHash: "a".repeat(64),
  canaryVersionId: "version-2",
  verifiedSpecHash: "a".repeat(64),
  everyBlockerPassed: true,
  noOpenIncident: true,
  claimsPass: true,
  externalWitnessSatisfied: true,
  confirmationsPass: true,
  approvalsPass: true,
  everyEvidenceCapabilityBound: true,
};

describe("deterministic release authority", () => {
  it("promotes only when every required predicate passes", () => {
    const decision = evaluatePromotion(passingFacts);
    expect(decision).toEqual({ decision: "PROMOTE", missing: [] });
    expect(
      applyPromotion(
        { canaryVersionId: "version-2", productionVersionId: "version-1", previousCertifiedVersionId: null },
        passingFacts,
      ),
    ).toEqual({
      canaryVersionId: "version-2",
      productionVersionId: "version-2",
      previousCertifiedVersionId: "version-1",
    });
  });

  it("names every missing predicate and never mutates pointers on block", () => {
    const failed: PromotionFacts = {
      ...passingFacts,
      verifiedSpecHash: "b".repeat(64),
      externalWitnessSatisfied: false,
      confirmationsPass: false,
    };
    const decision = evaluatePromotion(failed);

    expect(decision.decision).toBe("BLOCK");
    expect(decision.missing).toEqual(["SPEC_HASH_MISMATCH", "EXTERNAL_WITNESS", "REQUIRED_CONFIRMATION"]);
    expect(() =>
      applyPromotion(
        { canaryVersionId: "version-2", productionVersionId: "version-1", previousCertifiedVersionId: null },
        failed,
      ),
    ).toThrow("blocked");
  });
});
