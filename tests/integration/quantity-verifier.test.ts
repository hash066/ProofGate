import { chromium } from "@playwright/test";
import { describe, expect, it } from "vitest";

import { executeContractInPage } from "../../apps/verifier-runner/src/execute-contract";
import { BuyerContractSchema, deriveContractRunResult } from "../../packages/contract-runner/src/contract";
import { initialSpikeSiteSpec } from "../../packages/domain/src/site-spec";
import { buildSiteVersion } from "../../packages/domain/src/site-version";
import { renderSite } from "../../packages/renderer/src/render-site";
import { applyQuantityRepairPatch } from "../../packages/release-policy/src/quantity-repair";

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
    { op: "fill", handle: "buyer-name", value: "External verifier" },
    { op: "fill", handle: "buyer-email", value: "verifier@example.test" },
    { op: "set_quantity", handle: "quantity", value: 2 },
    { op: "click", handle: "primary-cta" },
  ],
  assertions: [{ op: "confirmation_contains", handle: "confirmation", value: "2 seats are reserved" }],
  timeoutMs: 30_000,
});

async function buildVersions() {
  const v1 = await buildSiteVersion(
    {
      ...initialSpikeSiteSpec,
      offer: {
        ...initialSpikeSiteSpec.offer,
        quantity: { enabled: false, min: 1, max: 1, default: 1 },
      },
    },
    { versionId: "quantity-v1", parentVersionId: null, actor: "site-builder", createdAt: 1_000 },
  );
  const repaired = await applyQuantityRepairPatch(
    v1,
    [
      { op: "replace", path: "/offer/quantity/enabled", value: true },
      { op: "replace", path: "/offer/quantity/max", value: 2 },
    ],
    { versionId: "quantity-v2", actor: "two-seat-quantity-repair-specialist", createdAt: 2_000 },
  );
  return { v1, v2: repaired.version };
}

describe("P0 capability-separated exact browser replay", () => {
  it("preserves the v1 quantity failure and passes the same contract on repaired v2", async () => {
    const { v1, v2 } = await buildVersions();
    const browser = await chromium.launch({ headless: true });
    try {
      const failedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
      const failedPage = await failedContext.newPage();
      await failedPage.route("https://proofgate.test/preview/quantity-v1", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          headers: { "x-proofgate-spec-hash": v1.specHash, "x-proofgate-version-id": v1.versionId },
          body: renderSite(v1.spec),
        }),
      );
      const failedObservations = await executeContractInPage(failedPage, {
        targetUrl: "https://proofgate.test/preview/quantity-v1",
        expectedVersionId: v1.versionId,
        expectedSpecHash: v1.specHash,
        contract,
      });
      expect(deriveContractRunResult(contract, failedObservations)).toEqual({
        status: "failed",
        failureCode: "QUANTITY_UNSUPPORTED",
        failedStepId: "step-3",
      });
      await failedContext.close();

      const passingContext = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
      const passingPage = await passingContext.newPage();
      await passingPage.route("https://proofgate.test/preview/quantity-v2", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          headers: { "x-proofgate-spec-hash": v2.specHash, "x-proofgate-version-id": v2.versionId },
          body: renderSite(v2.spec),
        }),
      );
      const passingObservations = await executeContractInPage(passingPage, {
        targetUrl: "https://proofgate.test/preview/quantity-v2",
        expectedVersionId: v2.versionId,
        expectedSpecHash: v2.specHash,
        contract,
      });
      expect(deriveContractRunResult(contract, passingObservations)).toEqual({ status: "passed" });
      expect(passingObservations.every((observation) => observation.status === "passed")).toBe(true);
      await passingContext.close();
    } finally {
      await browser.close();
    }
  }, 20_000);

  it("fails closed when the public response hash does not match the pinned immutable version", async () => {
    const { v2 } = await buildVersions();
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.route("https://proofgate.test/preview/quantity-v2", (route) =>
        route.fulfill({
          status: 200,
          contentType: "text/html",
          headers: { "x-proofgate-spec-hash": "f".repeat(64), "x-proofgate-version-id": v2.versionId },
          body: renderSite(v2.spec),
        }),
      );
      await expect(
        executeContractInPage(page, {
          targetUrl: "https://proofgate.test/preview/quantity-v2",
          expectedVersionId: v2.versionId,
          expectedSpecHash: v2.specHash,
          contract,
        }),
      ).rejects.toThrow("manifest hash mismatch");
    } finally {
      await context.close();
      await browser.close();
    }
  }, 20_000);
});
