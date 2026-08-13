import { describe, expect, it } from "vitest";

import {
  DecisionPolicySchema,
  evaluateDecision,
  fastPilotAutonomousActions,
} from "../../packages/domain/src/decision-policy";

const policy = DecisionPolicySchema.parse({
  schemaVersion: 1,
  policyId: "policy-fast-1",
  merchantId: "merchant-demo",
  ownerWaIdHash: "a".repeat(64),
  mode: "fast_pilot",
  autonomousActions: fastPilotAutonomousActions,
  createdAt: 1_754_000_000_000,
});

describe("merchant decision policy", () => {
  it("allows routine reversible work without another prompt", () => {
    expect(evaluateDecision(policy, { schemaVersion: 1, merchantId: "merchant-demo", action: "create_candidate" })).toEqual({
      decision: "allow",
      reason: "merchant_policy_allows_reversible_action",
      policyId: "policy-fast-1",
    });
  });

  it.each(["publish_release", "render_reel", "dispatch_call_batch", "publish_social_campaign"] as const)("requires an exact approval for %s", (action) => {
    expect(evaluateDecision(policy, { schemaVersion: 1, merchantId: "merchant-demo", action })).toMatchObject({
      decision: "require_approval",
      reason: "immutable_scope_approval_required",
    });
  });

  it.each(["scrape_leads", "take_payment", "auto_post_social", "publish_synthetic_product_media"] as const)("denies prohibited action %s", (action) => {
    expect(evaluateDecision(policy, { schemaVersion: 1, merchantId: "merchant-demo", action })).toMatchObject({
      decision: "deny",
      reason: "action_prohibited",
    });
  });

  it("fails closed when a policy is used for another merchant", () => {
    expect(evaluateDecision(policy, { schemaVersion: 1, merchantId: "other-merchant", action: "summarize_metrics" })).toMatchObject({
      decision: "deny",
      reason: "merchant_policy_mismatch",
    });
  });
});
