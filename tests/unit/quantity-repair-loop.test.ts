import { describe, expect, it } from "vitest";

import { BuyerContractSchema, evaluateContractCapabilities } from "../../packages/contract-runner/src/contract";
import { initialSpikeSiteSpec } from "../../packages/domain/src/site-spec";
import { buildSiteVersion } from "../../packages/domain/src/site-version";
import {
  applyQuantityRepairPatch,
  createQuantityFailureArtifacts,
} from "../../packages/release-policy/src/quantity-repair";

const contract = BuyerContractSchema.parse({
  schemaVersion: 1,
  contractId: "bc-two-saturday-seats-v1",
  siteId: "saturday-sessions",
  objective: "Book exactly two Saturday seats on mobile.",
  source: { kind: "operator", refId: "intention-quantity-two" },
  severity: "blocker",
  persona: { viewport: "mobile", locale: "en-US" },
  steps: [
    { op: "open_site" },
    { op: "set_quantity", handle: "quantity", value: 2 },
    { op: "click", handle: "primary-cta" },
  ],
  assertions: [{ op: "confirmation_contains", handle: "confirmation", value: "2 seats are reserved" }],
  timeoutMs: 30_000,
});

async function fixedOneSeatVersion() {
  return buildSiteVersion(
    {
      ...initialSpikeSiteSpec,
      offer: {
        ...initialSpikeSiteSpec.offer,
        quantity: { enabled: false, min: 1, max: 1, default: 1 },
      },
    },
    {
      versionId: "version-quantity-v1",
      parentVersionId: null,
      actor: "site-builder",
      createdAt: 1_000,
    },
  );
}

describe("P0 quantity failure and bounded repair", () => {
  it("creates an incident, automatic eval, and post-failure vetted runtime role", async () => {
    const version = await fixedOneSeatVersion();
    const failure = evaluateContractCapabilities(version.spec, contract);
    if (failure.status !== "failed") throw new Error("fixture must fail");

    const artifacts = createQuantityFailureArtifacts({
      missionId: "mission-quantity-1",
      runId: "run-quantity-v1-fail",
      version,
      contract,
      failure,
      missionStartedAt: 1_500,
      failedAt: 2_000,
      createdAt: 2_001,
    });

    expect(artifacts.incident).toMatchObject({
      state: "open",
      failureCode: "QUANTITY_UNSUPPORTED",
      repairable: true,
      sourceRunId: "run-quantity-v1-fail",
      allowedPatchPaths: ["/offer/quantity"],
    });
    expect(artifacts.evalCase).toMatchObject({
      addedAutomatically: true,
      contractId: contract.contractId,
      sourceFailureRunId: "run-quantity-v1-fail",
      failingVersionId: version.versionId,
    });
    expect(artifacts.runtimeRole).toMatchObject({
      capabilityId: "p0-quantity-repair-v1",
      allowedPatchPaths: ["/offer/quantity"],
      maxAttempts: 1,
      createdAt: 2_001,
    });
    expect(artifacts.runtimeRole.createdAt).toBeGreaterThan(2_000);
    expect(artifacts.runtimeRole.createdAt).toBeGreaterThan(1_500);
  });

  it("applies one allowlisted SiteSpec patch to an immutable parent and exact replay becomes ready", async () => {
    const parent = await fixedOneSeatVersion();
    const patch = [
      { op: "replace", path: "/offer/quantity/enabled", value: true },
      { op: "replace", path: "/offer/quantity/max", value: 2 },
    ] as const;

    const repaired = await applyQuantityRepairPatch(parent, patch, {
      versionId: "version-quantity-v2",
      actor: "two-seat-quantity-repair-specialist",
      createdAt: 3_000,
    });

    expect(parent.spec.offer.quantity).toEqual({ enabled: false, min: 1, max: 1, default: 1 });
    expect(repaired.version.parentVersionId).toBe(parent.versionId);
    expect(repaired.version.specHash).not.toBe(parent.specHash);
    expect(repaired.appliedPatch).toEqual(patch);
    expect(repaired.riskClass).toBe("critical_path");
    expect(repaired.requiresFreshExternalWitness).toBe(true);
    expect(evaluateContractCapabilities(repaired.version.spec, contract)).toEqual({ status: "ready" });
  });

  it("rejects every patch outside offer.quantity", async () => {
    const parent = await fixedOneSeatVersion();
    await expect(
      applyQuantityRepairPatch(
        parent,
        [{ op: "replace", path: "/theme/accent", value: "#000000" }],
        { versionId: "version-forbidden", actor: "quantity-specialist", createdAt: 3_000 },
      ),
    ).rejects.toThrow("outside the quantity-repair capability");
  });
});
