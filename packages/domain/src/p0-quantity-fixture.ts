import type { BuyerContract } from "../../contract-runner/src/contract";
import { SiteSpecSchema, initialSpikeSiteSpec } from "./site-spec";

export const p0QuantityV1Spec = SiteSpecSchema.parse({
  ...initialSpikeSiteSpec,
  offer: {
    ...initialSpikeSiteSpec.offer,
    quantity: { enabled: false, min: 1, max: 1, default: 1 },
  },
});

export const p0QuantityContract = {
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
} satisfies BuyerContract;

export const p0QuantityRepairPatch = [
  { op: "replace", path: "/offer/quantity/enabled", value: true },
  { op: "replace", path: "/offer/quantity/max", value: 2 },
] as const;
