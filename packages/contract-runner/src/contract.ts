import { z } from "zod";

import { SiteSpecSchema, type SiteSpec } from "../../domain/src/site-spec";

const StableHandleSchema = z.enum([
  "primary-cta",
  "quantity",
  "buyer-name",
  "buyer-email",
  "telegram-link",
  "confirmation",
]);

const FillableHandleSchema = z.enum(["buyer-name", "buyer-email"]);

const ContractStepSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("open_site") }),
  z.object({ op: z.literal("set_quantity"), handle: z.literal("quantity"), value: z.int().min(1).max(50) }),
  z.object({ op: z.literal("fill"), handle: FillableHandleSchema, value: z.string().max(200) }),
  z.object({ op: z.literal("click"), handle: StableHandleSchema }),
]);

const ContractAssertionSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("handle_visible"), handle: StableHandleSchema }),
  z.object({ op: z.literal("handle_enabled"), handle: StableHandleSchema }),
  z.object({ op: z.literal("confirmation_contains"), handle: z.literal("confirmation"), value: z.string().min(1).max(200) }),
]);

export const BuyerContractSchema = z.object({
  schemaVersion: z.literal(1),
  contractId: z.string().regex(/^[a-z0-9-]{3,96}$/),
  siteId: z.string().regex(/^[a-z0-9-]{3,64}$/),
  objective: z.string().trim().min(1).max(500),
  source: z.object({
    kind: z.enum(["merchant_brief", "operator", "browser_failure", "customer_voice_note", "customer_call"]),
    refId: z.string().min(1).max(128),
  }),
  severity: z.enum(["blocker", "warning"]),
  persona: z.object({ viewport: z.enum(["mobile", "desktop"]), locale: z.string().regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/) }),
  steps: z.array(ContractStepSchema).min(1).max(30),
  assertions: z.array(ContractAssertionSchema).min(1).max(30),
  timeoutMs: z.int().min(1_000).max(120_000),
});

export type BuyerContract = z.infer<typeof BuyerContractSchema>;

export const ContractObservationSchema = z.object({
  itemId: z.string().regex(/^(step|assertion)-\d+$/),
  kind: z.enum(["step", "assertion"]),
  operation: z.string().min(1).max(64),
  status: z.enum(["passed", "failed"]),
  failureCode: z
    .enum(["QUANTITY_UNSUPPORTED", "HANDLE_MISSING", "ASSERTION_FAILED", "NAVIGATION_FAILED"])
    .optional(),
  observedSummary: z.string().min(1).max(500),
  observedAt: z.number().int().positive(),
});

export type ContractObservation = z.infer<typeof ContractObservationSchema>;

export type ContractRunResult =
  | { status: "passed" }
  | {
      status: "failed";
      failureCode: NonNullable<ContractObservation["failureCode"]>;
      failedStepId: string;
    };

export function deriveContractRunResult(
  contractInput: BuyerContract,
  observationsInput: ContractObservation[],
): ContractRunResult {
  const contract = BuyerContractSchema.parse(contractInput);
  const observations = z.array(ContractObservationSchema).parse(observationsInput);
  const failure = observations.find((observation) => observation.status === "failed");
  if (failure) {
    if (!failure.failureCode) throw new Error("failed observation requires a failure code");
    return { status: "failed", failureCode: failure.failureCode, failedStepId: failure.itemId };
  }

  const expectedIds = [
    ...contract.steps.map((_, index) => `step-${index}`),
    ...contract.assertions.map((_, index) => `assertion-${index}`),
  ];
  if (
    observations.length !== expectedIds.length ||
    observations.some((observation, index) => observation.itemId !== expectedIds[index])
  ) {
    throw new Error("incomplete or reordered contract observations");
  }
  return { status: "passed" };
}

export type ContractCapabilityResult =
  | { status: "ready" }
  | {
      status: "failed";
      failureCode: "QUANTITY_UNSUPPORTED";
      expectedQuantity: number;
      supportedMaximum: number;
    };

export function evaluateContractCapabilities(
  specInput: SiteSpec,
  contractInput: BuyerContract,
): ContractCapabilityResult {
  const spec = SiteSpecSchema.parse(specInput);
  const contract = BuyerContractSchema.parse(contractInput);
  if (spec.siteId !== contract.siteId) throw new Error("contract does not target this site");

  const quantityStep = contract.steps.find((step) => step.op === "set_quantity");
  if (quantityStep?.op === "set_quantity") {
    const quantity = spec.offer.quantity;
    if (!quantity.enabled || quantityStep.value < quantity.min || quantityStep.value > quantity.max) {
      return {
        status: "failed",
        failureCode: "QUANTITY_UNSUPPORTED",
        expectedQuantity: quantityStep.value,
        supportedMaximum: quantity.enabled ? quantity.max : quantity.default,
      };
    }
  }

  return { status: "ready" };
}
