import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9-]{3,64}$/);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const timestamp = z.number().int().nonnegative();

export const ReversibleDecisionActionSchema = z.enum([
  "transcribe_voice",
  "ingest_supplied_assets",
  "extract_catalog",
  "generate_copy",
  "create_candidate",
  "run_verification",
  "generate_reel_angles",
  "summarize_metrics",
  "propose_improvement",
]);

export const ApprovalDecisionActionSchema = z.enum([
  "publish_release",
  "render_reel",
  "dispatch_call_batch",
  "publish_social_campaign",
]);

export const ProhibitedDecisionActionSchema = z.enum([
  "scrape_leads",
  "take_payment",
  "auto_post_social",
  "publish_synthetic_product_media",
]);

export const DecisionActionSchema = z.union([
  ReversibleDecisionActionSchema,
  ApprovalDecisionActionSchema,
  ProhibitedDecisionActionSchema,
]);

export type ReversibleDecisionAction = z.infer<typeof ReversibleDecisionActionSchema>;
export type DecisionAction = z.infer<typeof DecisionActionSchema>;

export const fastPilotAutonomousActions: ReversibleDecisionAction[] = [
  "transcribe_voice",
  "ingest_supplied_assets",
  "extract_catalog",
  "generate_copy",
  "create_candidate",
  "run_verification",
  "generate_reel_angles",
  "summarize_metrics",
  "propose_improvement",
];

export const DecisionPolicySchema = z.object({
  schemaVersion: z.literal(1),
  policyId: slug,
  merchantId: slug,
  ownerWaIdHash: sha256,
  mode: z.enum(["fast_pilot", "review_drafts"]),
  autonomousActions: z.array(ReversibleDecisionActionSchema).max(fastPilotAutonomousActions.length),
  supersedesPolicyId: slug.optional(),
  createdAt: timestamp,
});

export type DecisionPolicyV1 = z.infer<typeof DecisionPolicySchema>;

export const DecisionRequestSchema = z.object({
  schemaVersion: z.literal(1),
  merchantId: slug,
  action: DecisionActionSchema,
});

export type DecisionRequestV1 = z.infer<typeof DecisionRequestSchema>;

export type DecisionResult = {
  decision: "allow" | "require_approval" | "deny";
  reason:
    | "merchant_policy_allows_reversible_action"
    | "merchant_policy_requires_review"
    | "immutable_scope_approval_required"
    | "action_prohibited"
    | "merchant_policy_mismatch";
  policyId: string;
};

export function evaluateDecision(policyInput: DecisionPolicyV1, requestInput: DecisionRequestV1): DecisionResult {
  const policy = DecisionPolicySchema.parse(policyInput);
  const request = DecisionRequestSchema.parse(requestInput);
  if (policy.merchantId !== request.merchantId) {
    return { decision: "deny", reason: "merchant_policy_mismatch", policyId: policy.policyId };
  }
  if (ProhibitedDecisionActionSchema.safeParse(request.action).success) {
    return { decision: "deny", reason: "action_prohibited", policyId: policy.policyId };
  }
  if (ApprovalDecisionActionSchema.safeParse(request.action).success) {
    return { decision: "require_approval", reason: "immutable_scope_approval_required", policyId: policy.policyId };
  }
  if (policy.autonomousActions.includes(request.action as ReversibleDecisionAction)) {
    return { decision: "allow", reason: "merchant_policy_allows_reversible_action", policyId: policy.policyId };
  }
  return { decision: "require_approval", reason: "merchant_policy_requires_review", policyId: policy.policyId };
}
