import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import {
  deriveOracleState,
  evaluateOraclePredicates,
  signBookingSession,
  verifySignedBookingSubmission,
  verifyBookingSession,
  type BookingEvent,
  type BookingSession,
} from "../../packages/release-policy/src/external-oracle";

const session: BookingSession = {
  schemaVersion: 1,
  nonce: "nonce-1234567890",
  correlationNonceHash: createHash("sha256").update("nonce-1234567890").digest("hex"),
  siteId: "saturday-sessions",
  versionId: "version-v1",
  specHash: "a".repeat(64),
  contractId: "contract-two-seats",
  runId: "run-1",
  action: "booking",
  expectedQuantity: 2,
  csrfIdentityHash: "b".repeat(64),
  issuedAt: 1_700_000_000_000,
  expiresAt: 1_700_000_300_000,
};

function event(level: BookingEvent["level"], overrides: Partial<BookingEvent> = {}): BookingEvent {
  return {
    eventId: `event-${level}`,
    provider: level === "submitted" ? "proofgate-edge" : "telegram",
    level,
    siteId: session.siteId,
    versionId: session.versionId,
    specHash: session.specHash,
    contractId: session.contractId,
    runId: session.runId,
    correlationNonceHash: session.correlationNonceHash,
    quantity: 2,
    verificationMethod: level === "submitted" ? "edge_hmac" : level === "dispatched" ? "provider_signature" : "merchant_ack",
    actorClass: level === "acknowledged" ? "external_human" : "system",
    verifierIdentity: level === "submitted" ? "proofgate-submitted" : session.csrfIdentityHash,
    occurredAt: 1_700_000_010_000,
    ...overrides,
  };
}

describe("mandatory Spike B external oracle", () => {
  it("keeps the passport amber for submitted and dispatched events", () => {
    expect(deriveOracleState(session, [event("submitted"), event("dispatched")])).toEqual({
      externalWitnessSatisfied: false,
      passportState: "amber",
      reason: "EXTERNAL_ACKNOWLEDGMENT_PENDING",
    });
  });

  it("turns the derived oracle green only for an exact external merchant acknowledgment", () => {
    expect(deriveOracleState(session, [event("submitted"), event("dispatched"), event("acknowledged")])).toEqual({
      externalWitnessSatisfied: true,
      passportState: "green",
      reason: "EXACT_EXTERNAL_ACKNOWLEDGMENT",
    });
  });

  it("reports each deterministic external-oracle predicate for public diagnostics", () => {
    expect(evaluateOraclePredicates(session, [event("submitted"), event("dispatched"), event("acknowledged")])).toEqual({
      submitted: true,
      dispatched: true,
      acknowledged: true,
    });
  });

  it("rejects team, wrong-version, and wrong-quantity acknowledgments", () => {
    for (const invalid of [
      event("acknowledged", { actorClass: "team" }),
      event("acknowledged", { versionId: "version-v2" }),
      event("acknowledged", { quantity: 1 }),
    ]) {
      expect(deriveOracleState(session, [event("submitted"), event("dispatched"), invalid]).externalWitnessSatisfied).toBe(false);
    }
  });

  it("rejects mismatched correlation, recipient, event windows, and unauthenticated dispatch", () => {
    const invalidSets: BookingEvent[][] = [
      [event("submitted"), event("dispatched", { correlationNonceHash: "d".repeat(64) }), event("acknowledged")],
      [event("submitted"), event("dispatched"), event("acknowledged", { verifierIdentity: "wrong-recipient" })],
      [event("submitted"), event("dispatched", { occurredAt: session.expiresAt + 1 }), event("acknowledged")],
      [event("submitted"), event("dispatched", { verificationMethod: "edge_hmac" }), event("acknowledged")],
      [event("submitted"), event("dispatched", { actorClass: "test" }), event("acknowledged")],
      [event("submitted"), event("dispatched", { verifierIdentity: "wrong-recipient" }), event("acknowledged")],
    ];

    for (const events of invalidSets) {
      expect(deriveOracleState(session, events).externalWitnessSatisfied).toBe(false);
    }
  });

  it("signs a version-bound session and fails closed on tampering or expiry", async () => {
    const secret = "development-only-spike-b-secret-with-32-chars";
    const token = await signBookingSession(session, secret);

    await expect(verifyBookingSession(token, secret, session.issuedAt + 1_000)).resolves.toEqual(session);
    await expect(verifyBookingSession(`${token}tampered`, secret, session.issuedAt + 1_000)).rejects.toThrow();
    await expect(verifyBookingSession(token, secret, session.expiresAt + 1)).rejects.toThrow("expired");
    await expect(
      signBookingSession({ ...session, correlationNonceHash: "f".repeat(64) }, secret),
    ).rejects.toThrow("nonce hash");
  });

  it("creates submitted evidence only from a valid signed booking request", async () => {
    const secret = "development-only-spike-b-secret-with-32-chars";
    const token = await signBookingSession(session, secret);
    const submission = await verifySignedBookingSubmission(token, secret, session.issuedAt + 2_000);

    expect(submission.session).toEqual(session);
    expect(submission.nonceHash).toBe(session.correlationNonceHash);
    expect(submission.providerEventId).toMatch(/^submitted:[a-f0-9]{64}$/);
    expect(submission.payloadHash).toMatch(/^[a-f0-9]{64}$/);
    expect(submission.occurredAt).toBe(session.issuedAt + 2_000);

    await expect(
      verifySignedBookingSubmission(`${token}tampered`, secret, session.issuedAt + 2_000),
    ).rejects.toThrow();
  });
});
