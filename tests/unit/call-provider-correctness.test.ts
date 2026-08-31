import { describe, expect, it, vi } from "vitest";

import { CallArtifactCopyReceiptSchema, CallAttemptSchema, assertVapiReportBinding, canClaimCallAttempt, mustRevokeLead, recordingConsentFromVapi } from "../../packages/calls/src/attempts";
import { createQualificationCall } from "../../packages/calls/src/vapi-client";

describe("per-lead call provider correctness", () => {
  it("correlates exactly one provider call to one immutable attempt", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ metadata: { batchId: "batch-1", leadId: "lead-1", attemptId: "attempt-batch-1-lead-1" } });
      return new Response(JSON.stringify({ id: "call-1" }), { status: 201 });
    });
    await expect(createQualificationCall({ apiKey: "key", phoneNumberId: "phone", squadId: "squad", batchId: "batch-1", attemptId: "attempt-batch-1-lead-1", earliestAt: "2027-01-15T10:00:00Z", lead: { leadId: "lead-1", number: "+919876543210" }, fetcher })).resolves.toEqual({ attemptId: "attempt-batch-1-lead-1", leadId: "lead-1", callId: "call-1" });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("fails closed when another attempt is active or the remaining cap is exhausted", () => {
    expect(canClaimCallAttempt({ actualCostMicrousd: 900_000, capMicrousd: 1_000_000, activeAttempt: false })).toEqual({ allowed: true, remainingCostMicrousd: 100_000 });
    expect(canClaimCallAttempt({ actualCostMicrousd: 1_000_000, capMicrousd: 1_000_000, activeAttempt: false }).allowed).toBe(false);
    expect(canClaimCallAttempt({ actualCostMicrousd: 0, capMicrousd: 1_000_000, activeAttempt: true }).allowed).toBe(false);
  });

  it("requires webhook batch, lead, attempt and provider call bindings to match", () => {
    const attempt = CallAttemptSchema.parse({ schemaVersion: 1, attemptId: "attempt-batch-1-lead-1", batchId: "batch-1", merchantId: "merchant-one", leadId: "lead-1", status: "provider_created", providerCallId: "call-1", claimedAt: 1, createdAt: 1 });
    expect(() => assertVapiReportBinding(attempt, { batchId: "batch-1", leadId: "lead-1", attemptId: "attempt-batch-1-lead-1", providerCallId: "wrong" })).toThrow(/binding/i);
  });

  it("accepts a 30-day private copy receipt only after granted recording consent", () => {
    expect(() => CallArtifactCopyReceiptSchema.parse({ schemaVersion: 1, artifactId: "artifact-1", attemptId: "attempt-batch-1-lead-1", providerCallId: "call-1", recordingConsent: "declined", bucketKey: "calls/merchant-one/call-1.wav", sha256: "a".repeat(64), byteLength: 10, copiedAt: 1, expiresAt: 2 })).toThrow(/granted/i);
    expect(() => CallArtifactCopyReceiptSchema.parse({ schemaVersion: 1, artifactId: "artifact-1", attemptId: "attempt-batch-1-lead-1", providerCallId: "call-1", recordingConsent: "granted", bucketKey: "calls/merchant-one/call-1.wav", sha256: "a".repeat(64), byteLength: 10, copiedAt: 1, expiresAt: 31 * 86_400_000 })).toThrow(/30 days/i);
  });

  it("distinguishes explicit recording decline and revokes do-not-call immediately", () => {
    expect(recordingConsentFromVapi({ structuredConsent: "declined" })).toBe("declined");
    expect(recordingConsentFromVapi({})).toBe("not_reached");
    expect(recordingConsentFromVapi({ grantedAt: "2027-01-15T10:00:00Z" })).toBe("granted");
    expect(mustRevokeLead({ outcome: "qualified", doNotCall: true })).toBe(true);
    expect(mustRevokeLead({ outcome: "do_not_call", doNotCall: false })).toBe(true);
  });
});
