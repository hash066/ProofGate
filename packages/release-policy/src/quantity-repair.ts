import { z } from "zod";

import type { BuyerContract, ContractCapabilityResult } from "../../contract-runner/src/contract";
import { SiteSpecSchema } from "../../domain/src/site-spec";
import { buildSiteVersion, type SiteVersion } from "../../domain/src/site-version";

const quantityPatchPath = z.enum([
  "/offer/quantity/enabled",
  "/offer/quantity/min",
  "/offer/quantity/max",
  "/offer/quantity/default",
]);

const QuantityPatchOperationSchema = z
  .object({
    op: z.literal("replace"),
    path: quantityPatchPath,
    value: z.union([z.boolean(), z.int().min(1).max(50)]),
  })
  .superRefine((operation, context) => {
    if (operation.path === "/offer/quantity/enabled" && typeof operation.value !== "boolean") {
      context.addIssue({ code: "custom", message: "quantity enabled must be boolean" });
    }
    if (operation.path !== "/offer/quantity/enabled" && typeof operation.value !== "number") {
      context.addIssue({ code: "custom", message: "quantity bounds must be integers" });
    }
  });

export type QuantityFailure = Extract<ContractCapabilityResult, { status: "failed" }>;

export type QuantityFailureArtifacts = {
  incident: {
    incidentId: string;
    missionId: string;
    siteId: string;
    versionId: string;
    specHash: string;
    sourceRunId: string;
    failureCode: "QUANTITY_UNSUPPORTED";
    state: "open";
    repairable: true;
    allowedPatchPaths: ["/offer/quantity"];
    openedAt: number;
  };
  evalCase: {
    evalCaseId: string;
    contractId: string;
    contract: BuyerContract;
    addedAutomatically: true;
    sourceFailureRunId: string;
    failingVersionId: string;
    failingSpecHash: string;
    createdAt: number;
  };
  runtimeRole: {
    runtimeRoleId: string;
    roleName: string;
    capabilityId: "p0-quantity-repair-v1";
    incidentId: string;
    objective: string;
    allowedInputArtifacts: ["incident", "parent_site_version", "buyer_contract"];
    allowedPatchPaths: ["/offer/quantity"];
    forbiddenActions: string[];
    promptVersion: "quantity-repair-v1";
    model: "manager-selected";
    maxAttempts: 1;
    evidenceRequired: ["validated_site_spec", "new_spec_hash", "exact_replay"];
    createdAt: number;
  };
};

type FailureArtifactInput = {
  missionId: string;
  runId: string;
  version: SiteVersion;
  contract: BuyerContract;
  failure: QuantityFailure;
  missionStartedAt: number;
  failedAt: number;
  createdAt: number;
};

export function createQuantityFailureArtifacts(input: FailureArtifactInput): QuantityFailureArtifacts {
  if (input.failure.failureCode !== "QUANTITY_UNSUPPORTED") throw new Error("unsupported repair family");
  if (input.createdAt <= input.failedAt || input.createdAt <= input.missionStartedAt) {
    throw new Error("runtime role must be instantiated after the failure and mission start");
  }
  if (input.version.siteId !== input.contract.siteId) throw new Error("failure artifacts must share a site");

  const incidentId = `incident-${input.runId}`;
  return {
    incident: {
      incidentId,
      missionId: input.missionId,
      siteId: input.version.siteId,
      versionId: input.version.versionId,
      specHash: input.version.specHash,
      sourceRunId: input.runId,
      failureCode: "QUANTITY_UNSUPPORTED",
      state: "open",
      repairable: true,
      allowedPatchPaths: ["/offer/quantity"],
      openedAt: input.failedAt,
    },
    evalCase: {
      evalCaseId: `eval-${input.runId}`,
      contractId: input.contract.contractId,
      contract: input.contract,
      addedAutomatically: true,
      sourceFailureRunId: input.runId,
      failingVersionId: input.version.versionId,
      failingSpecHash: input.version.specHash,
      createdAt: input.failedAt,
    },
    runtimeRole: {
      runtimeRoleId: `role-${input.runId}`,
      roleName: `${input.failure.expectedQuantity}-seat-quantity-repair-specialist`,
      capabilityId: "p0-quantity-repair-v1",
      incidentId,
      objective: `Enable an exact quantity of ${input.failure.expectedQuantity} without changing any other SiteSpec path.`,
      allowedInputArtifacts: ["incident", "parent_site_version", "buyer_contract"],
      allowedPatchPaths: ["/offer/quantity"],
      forbiddenActions: [
        "modify_contract",
        "submit_evidence",
        "promote_release",
        "access_provider_credentials",
        "patch_outside_offer_quantity",
      ],
      promptVersion: "quantity-repair-v1",
      model: "manager-selected",
      maxAttempts: 1,
      evidenceRequired: ["validated_site_spec", "new_spec_hash", "exact_replay"],
      createdAt: input.createdAt,
    },
  };
}

type RepairMetadata = { versionId: string; actor: string; createdAt: number };

export async function applyQuantityRepairPatch(
  parent: SiteVersion,
  patchInput: readonly unknown[],
  metadata: RepairMetadata,
): Promise<{
  version: SiteVersion;
  appliedPatch: Array<z.infer<typeof QuantityPatchOperationSchema>>;
  riskClass: "critical_path";
  requiresFreshExternalWitness: true;
}> {
  let appliedPatch: Array<z.infer<typeof QuantityPatchOperationSchema>>;
  try {
    appliedPatch = z.array(QuantityPatchOperationSchema).min(1).max(4).parse(patchInput);
  } catch (error) {
    if (error instanceof z.ZodError && error.issues.some((issue) => issue.path.includes("path"))) {
      throw new Error("patch path is outside the quantity-repair capability");
    }
    throw error;
  }

  const candidate = structuredClone(parent.spec);
  for (const operation of appliedPatch) {
    const key = operation.path.slice("/offer/quantity/".length) as "enabled" | "min" | "max" | "default";
    if (key === "enabled") candidate.offer.quantity.enabled = operation.value as boolean;
    else candidate.offer.quantity[key] = operation.value as number;
  }
  const validated = SiteSpecSchema.parse(candidate);
  const version = await buildSiteVersion(validated, {
    versionId: metadata.versionId,
    parentVersionId: parent.versionId,
    actor: metadata.actor,
    createdAt: metadata.createdAt,
  });

  return {
    version,
    appliedPatch,
    riskClass: "critical_path",
    requiresFreshExternalWitness: true,
  };
}
