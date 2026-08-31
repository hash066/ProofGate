import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z0-9_.:-]{3,256}$/);
const timestamp = z.number().int().nonnegative();

export const CallAttemptSchema = z.object({
  schemaVersion: z.literal(1), attemptId: id, batchId: id, merchantId: id, leadId: id,
  status: z.enum(["pending", "claimed", "provider_created", "completed", "failed"]),
  providerCallId: id.optional(), claimedAt: timestamp.optional(), createdAt: timestamp,
}).superRefine((attempt, context) => {
  if (["provider_created", "completed"].includes(attempt.status) && !attempt.providerCallId) context.addIssue({ code: "custom", path: ["providerCallId"], message: "provider-created attempts require a call ID" });
});
export type CallAttempt = z.infer<typeof CallAttemptSchema>;

export function canClaimCallAttempt(input: { actualCostMicrousd: number; capMicrousd: number; activeAttempt: boolean }) {
  const remainingCostMicrousd = Math.max(0, input.capMicrousd - input.actualCostMicrousd);
  return { allowed: !input.activeAttempt && remainingCostMicrousd > 0, remainingCostMicrousd };
}

export function assertVapiReportBinding(attempt: CallAttempt, report: { batchId: string; leadId: string; attemptId: string; providerCallId: string }): void {
  if (attempt.batchId !== report.batchId || attempt.leadId !== report.leadId || attempt.attemptId !== report.attemptId || attempt.providerCallId !== report.providerCallId) throw new Error("Vapi report binding mismatch");
}

export function recordingConsentFromVapi(input: { grantedAt?: unknown; structuredConsent?: unknown }): "granted" | "declined" | "not_reached" {
  if (typeof input.grantedAt === "string" && Number.isFinite(Date.parse(input.grantedAt))) return "granted";
  return input.structuredConsent === "declined" ? "declined" : "not_reached";
}

export function mustRevokeLead(input: { outcome: string; doNotCall: unknown }): boolean {
  return input.outcome === "do_not_call" || input.doNotCall === true;
}

export const CallArtifactCopyReceiptSchema = z.object({
  schemaVersion: z.literal(1), artifactId: id, attemptId: id, providerCallId: id,
  recordingConsent: z.literal("granted"),
  bucketKey: z.string().regex(/^calls\/[a-zA-Z0-9_-]{3,128}\/[a-zA-Z0-9_.-]{3,256}$/),
  sha256: z.string().regex(/^[a-f0-9]{64}$/), byteLength: z.number().int().positive(), copiedAt: timestamp, expiresAt: timestamp,
}).superRefine((receipt, context) => {
  if (receipt.expiresAt <= receipt.copiedAt || receipt.expiresAt - receipt.copiedAt > 30 * 86_400_000) context.addIssue({ code: "custom", path: ["expiresAt"], message: "recordings may be retained for at most 30 days" });
});
export type CallArtifactCopyReceipt = z.infer<typeof CallArtifactCopyReceiptSchema>;
