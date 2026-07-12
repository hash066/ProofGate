import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sites: defineTable({
    slug: v.string(),
    canaryVersionId: v.optional(v.string()),
    productionVersionId: v.optional(v.string()),
    previousCertifiedVersionId: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_slug", ["slug"]),

  siteVersions: defineTable({
    siteId: v.id("sites"),
    versionId: v.string(),
    parentVersionId: v.optional(v.string()),
    specJson: v.string(),
    specHash: v.string(),
    actor: v.string(),
    createdAt: v.number(),
  })
    .index("by_site_version", ["siteId", "versionId"])
    .index("by_site_created", ["siteId", "createdAt"]),

  releases: defineTable({
    siteId: v.id("sites"),
    versionId: v.string(),
    specHash: v.string(),
    decision: v.union(v.literal("promote"), v.literal("rollback")),
    previousVersionId: v.optional(v.string()),
    reason: v.string(),
    createdAt: v.number(),
  }).index("by_site_created", ["siteId", "createdAt"]),

  bookingSessions: defineTable({
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
    submittedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
  })
    .index("by_nonce_hash", ["nonceHash"])
    .index("by_site_version", ["siteId", "versionId"]),

  externalEvents: defineTable({
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
  })
    .index("by_provider_event_id", ["provider", "providerEventId"])
    .index("by_correlation", ["correlationNonceHash"])
    .index("by_run", ["runId"]),

  passportSubjects: defineTable({
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    contractId: v.string(),
    runId: v.string(),
    bookingSessionId: v.id("bookingSessions"),
    createdAt: v.number(),
  }).index("by_site", ["siteId"]),
});
