import { describe, expect, it } from "vitest";

import { initialSpikeSiteSpec } from "../../packages/domain/src/site-spec";
import {
  BuyerContractSchema,
  evaluateContractCapabilities,
} from "../../packages/contract-runner/src/contract";

const twoSeatContract = {
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
} as const;

describe("P0 restricted Buyer Contract", () => {
  it("fails the initial fixed-one-seat version with QUANTITY_UNSUPPORTED", () => {
    const contract = BuyerContractSchema.parse(twoSeatContract);
    const fixedOneSeatSpec = {
      ...initialSpikeSiteSpec,
      offer: {
        ...initialSpikeSiteSpec.offer,
        quantity: { enabled: false, min: 1, max: 1, default: 1 },
      },
    };

    expect(evaluateContractCapabilities(fixedOneSeatSpec, contract)).toEqual({
      status: "failed",
      failureCode: "QUANTITY_UNSUPPORTED",
      expectedQuantity: 2,
      supportedMaximum: 1,
    });
  });

  it("rejects unknown handles instead of accepting arbitrary selectors", () => {
    expect(() =>
      BuyerContractSchema.parse({
        ...twoSeatContract,
        steps: [{ op: "click", handle: "merchant-supplied-selector" }],
      }),
    ).toThrow();
  });
});
