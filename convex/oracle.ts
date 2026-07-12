import { v } from "convex/values";

import { api, internal } from "./_generated/api";
import { action, internalMutation, query } from "./_generated/server";
import {
  deriveOracleState,
  evaluateOraclePredicates,
  verifyBookingSession,
  verifySignedBookingSubmission,
  type BookingEvent,
  type BookingSession,
} from "../packages/release-policy/src/external-oracle";

export const createBookingSession = internalMutation({
  args: {
    nonceHash: v.string(),
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    contractId: v.string(),
    runId: v.string(),
    expectedQuantity: v.number(),
    csrfIdentityHash: v.string(),
    issuedAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (context, args) => context.db.insert("bookingSessions", args),
});

export const appendVerifiedEvent = internalMutation({
  args: {
    providerEventId: v.string(),
    provider: v.union(v.literal("proofgate-edge"), v.literal("telegram"), v.literal("dodo")),
    level: v.union(v.literal("submitted"), v.literal("dispatched"), v.literal("acknowledged")),
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    contractId: v.string(),
    runId: v.string(),
    correlationNonceHash: v.string(),
    quantity: v.number(),
    verificationMethod: v.union(v.literal("provider_signature"), v.literal("edge_hmac"), v.literal("merchant_ack"), v.literal("buyer_ack")),
    actorClass: v.union(v.literal("external_human"), v.literal("system"), v.literal("team"), v.literal("test"), v.literal("synthetic_verifier")),
    verifiedAt: v.number(),
    verifierIdentity: v.string(),
    environment: v.string(),
    redactedPayload: v.string(),
    payloadHash: v.string(),
    occurredAt: v.number(),
  },
  handler: async (context, args) => {
    const duplicate = await context.db
      .query("externalEvents")
      .filter((query) =>
        query.and(query.eq(query.field("provider"), args.provider), query.eq(query.field("providerEventId"), args.providerEventId)),
      )
      .first();
    if (duplicate) return { inserted: false, eventId: duplicate._id };
    return { inserted: true, eventId: await context.db.insert("externalEvents", args) };
  },
});

export const createSpikeBSubject = internalMutation({
  args: {
    nonceHash: v.string(),
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    contractId: v.string(),
    runId: v.string(),
    expectedQuantity: v.number(),
    csrfIdentityHash: v.string(),
    issuedAt: v.number(),
    expiresAt: v.number(),
  },
  handler: async (context, args) => {
    const bookingSessionId = await context.db.insert("bookingSessions", {
      nonceHash: args.nonceHash,
      siteId: args.siteId,
      versionId: args.versionId,
      specHash: args.specHash,
      contractId: args.contractId,
      runId: args.runId,
      expectedQuantity: args.expectedQuantity,
      csrfIdentityHash: args.csrfIdentityHash,
      issuedAt: args.issuedAt,
      expiresAt: args.expiresAt,
    });
    const subjectId = await context.db.insert("passportSubjects", {
      siteId: args.siteId,
      versionId: args.versionId,
      specHash: args.specHash,
      contractId: args.contractId,
      runId: args.runId,
      bookingSessionId,
      createdAt: Date.now(),
    });
    return { bookingSessionId, subjectId };
  },
});

export const appendSubmissionFromSession = internalMutation({
  args: {
    nonceHash: v.string(),
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    contractId: v.string(),
    runId: v.string(),
    quantity: v.number(),
    recipientIdentityHash: v.string(),
    providerEventId: v.string(),
    payloadHash: v.string(),
    occurredAt: v.number(),
  },
  handler: async (context, args) => {
    const bookingSession = await context.db
      .query("bookingSessions")
      .withIndex("by_nonce_hash", (range) => range.eq("nonceHash", args.nonceHash))
      .unique();
    if (!bookingSession) throw new Error("booking session not found");
    const duplicate = await context.db
      .query("externalEvents")
      .withIndex("by_provider_event_id", (range) =>
        range.eq("provider", "proofgate-edge").eq("providerEventId", args.providerEventId),
      )
      .unique();
    if (duplicate) return { inserted: false, eventId: duplicate._id };
    if (bookingSession.submittedAt !== undefined) throw new Error("booking session already submitted");
    const matches =
      bookingSession.siteId === args.siteId &&
      bookingSession.versionId === args.versionId &&
      bookingSession.specHash === args.specHash &&
      bookingSession.contractId === args.contractId &&
      bookingSession.runId === args.runId &&
      bookingSession.expectedQuantity === args.quantity &&
      bookingSession.csrfIdentityHash === args.recipientIdentityHash;
    if (!matches) throw new Error("signed booking submission does not match the stored session");
    if (args.occurredAt < bookingSession.issuedAt) throw new Error("submission predates booking session");
    if (args.occurredAt > bookingSession.expiresAt) throw new Error("booking session expired");
    const eventId = await context.db.insert("externalEvents", {
      providerEventId: args.providerEventId,
      provider: "proofgate-edge",
      level: "submitted",
      siteId: args.siteId,
      versionId: args.versionId,
      specHash: args.specHash,
      contractId: args.contractId,
      runId: args.runId,
      correlationNonceHash: args.nonceHash,
      quantity: args.quantity,
      verificationMethod: "edge_hmac",
      actorClass: "system",
      verifiedAt: args.occurredAt,
      verifierIdentity: "proofgate-edge:signed-booking-submit",
      environment: "development_spike",
      redactedPayload: "signed booking request verified",
      payloadHash: args.payloadHash,
      occurredAt: args.occurredAt,
    });
    await context.db.patch(bookingSession._id, { submittedAt: args.occurredAt });
    return { inserted: true, eventId };
  },
});

export const appendAcknowledgmentFromSession = internalMutation({
  args: {
    nonceHash: v.string(),
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    contractId: v.string(),
    runId: v.string(),
    quantity: v.number(),
    recipientIdentityHash: v.string(),
    providerEventId: v.string(),
    payloadHash: v.string(),
    occurredAt: v.number(),
  },
  handler: async (context, args) => {
    const bookingSession = await context.db
      .query("bookingSessions")
      .withIndex("by_nonce_hash", (range) => range.eq("nonceHash", args.nonceHash))
      .unique();
    if (!bookingSession) throw new Error("booking session not found");
    if (bookingSession.consumedAt !== undefined) throw new Error("booking session already consumed");
    const matches =
      bookingSession.siteId === args.siteId &&
      bookingSession.versionId === args.versionId &&
      bookingSession.specHash === args.specHash &&
      bookingSession.contractId === args.contractId &&
      bookingSession.runId === args.runId &&
      bookingSession.expectedQuantity === args.quantity &&
      bookingSession.csrfIdentityHash === args.recipientIdentityHash;
    if (!matches) throw new Error("acknowledgment does not match the stored booking session");
    if (args.occurredAt < bookingSession.issuedAt) throw new Error("acknowledgment predates booking session");
    if (args.occurredAt > bookingSession.expiresAt) throw new Error("booking session expired");
    const duplicate = await context.db
      .query("externalEvents")
      .withIndex("by_provider_event_id", (range) => range.eq("provider", "telegram").eq("providerEventId", args.providerEventId))
      .unique();
    if (duplicate) return { inserted: false, eventId: duplicate._id };
    const eventId = await context.db.insert("externalEvents", {
      providerEventId: args.providerEventId,
      provider: "telegram",
      level: "acknowledged",
      siteId: args.siteId,
      versionId: args.versionId,
      specHash: args.specHash,
      contractId: args.contractId,
      runId: args.runId,
      correlationNonceHash: args.nonceHash,
      quantity: args.quantity,
      verificationMethod: "merchant_ack",
      actorClass: "external_human",
      verifiedAt: args.occurredAt,
      verifierIdentity: args.recipientIdentityHash,
      environment: "development_spike",
      redactedPayload: "external recipient clicked the bound acknowledgment link",
      payloadHash: args.payloadHash,
      occurredAt: args.occurredAt,
    });
    await context.db.patch(bookingSession._id, { consumedAt: args.occurredAt });
    return { inserted: true, eventId };
  },
});

async function sha256(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const submitBooking = action({
  args: { token: v.string() },
  handler: async (context, { token }): Promise<{ inserted: boolean; runId: string }> => {
    const secret = process.env.BOOKING_SESSION_SECRET;
    if (!secret) throw new Error("BOOKING_SESSION_SECRET is not configured");
    const submission = await verifySignedBookingSubmission(token, secret);
    const session = submission.session;
    const result = await context.runMutation(internal.oracle.appendSubmissionFromSession, {
      nonceHash: submission.nonceHash,
      siteId: session.siteId,
      versionId: session.versionId,
      specHash: session.specHash,
      contractId: session.contractId,
      runId: session.runId,
      quantity: session.expectedQuantity,
      recipientIdentityHash: session.csrfIdentityHash,
      providerEventId: submission.providerEventId,
      payloadHash: submission.payloadHash,
      occurredAt: submission.occurredAt,
    });
    return { inserted: result.inserted, runId: session.runId };
  },
});

export const acknowledgeBooking = action({
  args: { token: v.string() },
  handler: async (context, { token }): Promise<{ inserted: boolean; passportState: "amber" | "green" }> => {
    const secret = process.env.BOOKING_SESSION_SECRET;
    if (!secret) throw new Error("BOOKING_SESSION_SECRET is not configured");
    const session = await verifyBookingSession(token, secret);
    const nonceHash = await sha256(session.nonce);
    const payloadHash = await sha256(`merchant_ack:${token}`);
    const result = await context.runMutation(internal.oracle.appendAcknowledgmentFromSession, {
      nonceHash,
      siteId: session.siteId,
      versionId: session.versionId,
      specHash: session.specHash,
      contractId: session.contractId,
      runId: session.runId,
      quantity: session.expectedQuantity,
      recipientIdentityHash: session.csrfIdentityHash,
      providerEventId: `ack:${payloadHash}`,
      payloadHash,
      occurredAt: Date.now(),
    });
    const projection = await context.runQuery(api.oracle.getPassportProjection, { siteId: session.siteId });
    return { inserted: result.inserted, passportState: projection.passportState === "green" ? "green" : "amber" };
  },
});

export const getPassportProjection = query({
  args: { siteId: v.string() },
  handler: async (context, { siteId }) => {
    const subject = await context.db
      .query("passportSubjects")
      .filter((query) => query.eq(query.field("siteId"), siteId))
      .order("desc")
      .first();
    if (!subject) return { passportState: "gray", externalWitnessSatisfied: false, reason: "NO_CERTIFICATION_SUBJECT" };
    const sessionDocument = await context.db.get(subject.bookingSessionId);
    if (!sessionDocument) throw new Error("passport subject references a missing booking session");
    const events = await context.db
      .query("externalEvents")
      .filter((query) => query.eq(query.field("runId"), subject.runId))
      .collect();
    const session: BookingSession = {
      schemaVersion: 1,
      nonce: "stored-as-hash-in-convex",
      correlationNonceHash: sessionDocument.nonceHash,
      siteId: sessionDocument.siteId,
      versionId: sessionDocument.versionId,
      specHash: sessionDocument.specHash,
      contractId: sessionDocument.contractId,
      runId: sessionDocument.runId,
      action: "booking",
      expectedQuantity: sessionDocument.expectedQuantity,
      csrfIdentityHash: sessionDocument.csrfIdentityHash,
      issuedAt: sessionDocument.issuedAt,
      expiresAt: sessionDocument.expiresAt,
    };
    const bookingEvents = events.map(
        (event): BookingEvent => ({
          eventId: event.providerEventId,
          provider: event.provider,
          level: event.level,
          siteId: event.siteId,
          versionId: event.versionId,
          specHash: event.specHash,
          contractId: event.contractId,
          runId: event.runId,
          correlationNonceHash: event.correlationNonceHash,
          quantity: event.quantity,
          verificationMethod: event.verificationMethod,
          actorClass: event.actorClass,
          verifierIdentity: event.verifierIdentity,
          occurredAt: event.occurredAt,
        }),
      );
    return {
      ...deriveOracleState(session, bookingEvents),
      predicates: evaluateOraclePredicates(session, bookingEvents),
      runId: subject.runId,
    };
  },
});
