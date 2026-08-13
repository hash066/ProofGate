import type { ApprovalV1 } from "../../domain/src/growth";

export type CallBatch = {
  batchId: string;
  merchantId: string;
  leadIds: string[];
  countries: Array<"IN" | "US">;
  scriptVersion: string;
  earliestAt: number;
  latestAt: number;
  maxAttemptsPerLead: 1;
  costCapUsd: number;
  scopeHash: string;
};

type CallBatchInput = Omit<CallBatch, "scopeHash">;

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizedBatch(input: CallBatchInput): CallBatchInput {
  return { ...input, leadIds: [...input.leadIds].sort(), countries: [...input.countries].sort() as Array<"IN" | "US"> };
}

export async function createCallBatch(input: CallBatchInput): Promise<CallBatch> {
  if (input.maxAttemptsPerLead !== 1) throw new Error("only one call attempt per approved lead is allowed");
  if (input.leadIds.length === 0 || new Set(input.leadIds).size !== input.leadIds.length) throw new Error("lead IDs must be non-empty and unique");
  if (input.latestAt <= input.earliestAt) throw new Error("call batch window is invalid");
  if (input.costCapUsd <= 0) throw new Error("call batch cost cap must be positive");
  const normalized = normalizedBatch(input);
  return { ...normalized, scopeHash: await sha256(canonicalize(normalized)) };
}

export async function evaluateCallBatch(
  batch: CallBatch,
  approval: ApprovalV1,
  now: number,
): Promise<{ allowed: true } | { allowed: false; reason: string }> {
  if (approval.type !== "call_batch" || approval.decision !== "approved") return { allowed: false, reason: "NOT_APPROVED" };
  if (approval.expiresAt < now) return { allowed: false, reason: "APPROVAL_EXPIRED" };
  if (approval.merchantId !== batch.merchantId) return { allowed: false, reason: "MERCHANT_MISMATCH" };
  const { scopeHash: _ignored, ...input } = batch;
  const rebuilt = await createCallBatch(input);
  if (rebuilt.scopeHash !== approval.scopeHash) return { allowed: false, reason: "BATCH_SCOPE_CHANGED" };
  return { allowed: true };
}

export function shouldProposeImprovement(input: { requestedNow: boolean; elapsedDays: number; qualifiedViews: number }): { eligible: boolean; reason: "merchant_requested" | "seven_days" | "one_hundred_views" | "insufficient_signal" } {
  if (input.requestedNow) return { eligible: true, reason: "merchant_requested" };
  if (input.elapsedDays >= 7) return { eligible: true, reason: "seven_days" };
  if (input.qualifiedViews >= 100) return { eligible: true, reason: "one_hundred_views" };
  return { eligible: false, reason: "insufficient_signal" };
}
