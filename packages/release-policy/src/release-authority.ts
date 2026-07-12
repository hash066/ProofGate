export type PromotionFacts = {
  candidateVersionId: string;
  candidateSpecHash: string;
  canaryVersionId: string | null;
  verifiedSpecHash: string;
  everyBlockerPassed: boolean;
  noOpenIncident: boolean;
  claimsPass: boolean;
  externalWitnessSatisfied: boolean;
  confirmationsPass: boolean;
  approvalsPass: boolean;
  everyEvidenceCapabilityBound: boolean;
};

export type PromotionBlocker =
  | "CANARY_POINTER_MISMATCH"
  | "SPEC_HASH_MISMATCH"
  | "BLOCKER_RUNS"
  | "OPEN_INCIDENT"
  | "CLAIMS"
  | "EXTERNAL_WITNESS"
  | "REQUIRED_CONFIRMATION"
  | "APPROVALS"
  | "EVIDENCE_CAPABILITY";

export type PromotionDecision =
  | { decision: "PROMOTE"; missing: [] }
  | { decision: "BLOCK"; missing: PromotionBlocker[] };

export type SitePointers = {
  canaryVersionId: string | null;
  productionVersionId: string | null;
  previousCertifiedVersionId: string | null;
};

export function evaluatePromotion(facts: PromotionFacts): PromotionDecision {
  const missing: PromotionBlocker[] = [];
  if (facts.canaryVersionId !== facts.candidateVersionId) missing.push("CANARY_POINTER_MISMATCH");
  if (facts.verifiedSpecHash !== facts.candidateSpecHash) missing.push("SPEC_HASH_MISMATCH");
  if (!facts.everyBlockerPassed) missing.push("BLOCKER_RUNS");
  if (!facts.noOpenIncident) missing.push("OPEN_INCIDENT");
  if (!facts.claimsPass) missing.push("CLAIMS");
  if (!facts.externalWitnessSatisfied) missing.push("EXTERNAL_WITNESS");
  if (!facts.confirmationsPass) missing.push("REQUIRED_CONFIRMATION");
  if (!facts.approvalsPass) missing.push("APPROVALS");
  if (!facts.everyEvidenceCapabilityBound) missing.push("EVIDENCE_CAPABILITY");
  return missing.length === 0 ? { decision: "PROMOTE", missing: [] } : { decision: "BLOCK", missing };
}

export function applyPromotion(pointers: SitePointers, facts: PromotionFacts): SitePointers {
  const decision = evaluatePromotion({ ...facts, canaryVersionId: pointers.canaryVersionId });
  if (decision.decision !== "PROMOTE") {
    throw new Error(`promotion blocked: ${decision.missing.join(",")}`);
  }
  return {
    canaryVersionId: pointers.canaryVersionId,
    productionVersionId: facts.candidateVersionId,
    previousCertifiedVersionId: pointers.productionVersionId,
  };
}
