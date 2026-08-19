import { v } from "convex/values";

import { internal } from "./_generated/api";
import { action, internalMutation, mutation, query } from "./_generated/server";
import { assertImmutableAssetRegistration, validateStoredAssetMetadata } from "./asset_policy";

function requireServiceSecret(value: string) {
  const expected = process.env.PROOFGATE_SERVICE_SECRET;
  if (!expected || value.length !== expected.length) throw new Error("unauthorized ProofGate service call");
  let different = 0;
  for (let index = 0; index < expected.length; index += 1) different |= expected.charCodeAt(index) ^ value.charCodeAt(index);
  if (different !== 0) throw new Error("unauthorized ProofGate service call");
}

export const createStudioLinkInternal = internalMutation({
  args: {
    linkId: v.string(), codeHash: v.string(), browserNonceHash: v.string(),
    intent: v.union(v.literal("website"), v.literal("reels"), v.literal("both")),
    expiresAt: v.number(), createdAt: v.number(),
  },
  handler: async (context, args) => {
    const existingLink = await context.db.query("studioLinkRequests").withIndex("by_link_id", (range) => range.eq("linkId", args.linkId)).unique();
    const existingCode = await context.db.query("studioLinkRequests").withIndex("by_code_hash", (range) => range.eq("codeHash", args.codeHash)).unique();
    if (existingLink || existingCode) throw new Error("studio link collision");
    await context.db.insert("studioLinkRequests", { ...args, status: "pending" });
    return { created: true };
  },
});

export const adminCreateStudioLink = action({
  args: {
    serviceSecret: v.string(), linkId: v.string(), codeHash: v.string(), browserNonceHash: v.string(),
    intent: v.union(v.literal("website"), v.literal("reels"), v.literal("both")),
    expiresAt: v.number(), createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ created: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.createStudioLinkInternal, record);
  },
});

export const claimStudioLinkInternal = internalMutation({
  args: { codeHash: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(), providerMessageId: v.string(), now: v.number() },
  handler: async (context, args) => {
    const link = await context.db.query("studioLinkRequests").withIndex("by_code_hash", (range) => range.eq("codeHash", args.codeHash)).unique();
    if (!link || link.expiresAt < args.now || link.status === "consumed") return { linked: false as const };
    if (link.status === "claimed") {
      return { linked: link.merchantId === args.merchantId && link.ownerWaIdHash === args.ownerWaIdHash };
    }
    await context.db.patch(link._id, {
      status: "claimed", merchantId: args.merchantId, ownerWaIdHash: args.ownerWaIdHash,
      providerMessageId: args.providerMessageId, claimedAt: args.now,
    });
    return { linked: true as const };
  },
});

export const adminClaimStudioLink = action({
  args: { serviceSecret: v.string(), codeHash: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(), providerMessageId: v.string(), now: v.number() },
  handler: async (context, args): Promise<{ linked: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.claimStudioLinkInternal, record);
  },
});

export const completeStudioLinkInternal = internalMutation({
  args: { linkId: v.string(), browserNonceHash: v.string(), sessionHash: v.string(), sessionExpiresAt: v.number(), now: v.number() },
  handler: async (context, args) => {
    const link = await context.db.query("studioLinkRequests").withIndex("by_link_id", (range) => range.eq("linkId", args.linkId)).unique();
    if (!link || link.browserNonceHash !== args.browserNonceHash || link.expiresAt < args.now) return { status: "expired" as const };
    if (link.status === "consumed") {
      const existingSession = await context.db.query("studioSessions").withIndex("by_session_hash", (range) => range.eq("sessionHash", args.sessionHash)).unique();
      return existingSession && existingSession.merchantId === link.merchantId
        ? { status: "authenticated" as const, merchantId: link.merchantId!, ownerWaIdHash: link.ownerWaIdHash!, intent: link.intent }
        : { status: "expired" as const };
    }
    if (link.status === "pending" || !link.merchantId || !link.ownerWaIdHash) return { status: "pending" as const };
    const existingSession = await context.db.query("studioSessions").withIndex("by_session_hash", (range) => range.eq("sessionHash", args.sessionHash)).unique();
    if (existingSession) throw new Error("studio session collision");
    await context.db.insert("studioSessions", {
      sessionHash: args.sessionHash, merchantId: link.merchantId, ownerWaIdHash: link.ownerWaIdHash,
      expiresAt: args.sessionExpiresAt, createdAt: args.now,
    });
    await context.db.patch(link._id, { status: "consumed", consumedAt: args.now });
    return { status: "authenticated" as const, merchantId: link.merchantId, ownerWaIdHash: link.ownerWaIdHash, intent: link.intent };
  },
});

export const adminCompleteStudioLink = action({
  args: { serviceSecret: v.string(), linkId: v.string(), browserNonceHash: v.string(), sessionHash: v.string(), sessionExpiresAt: v.number(), now: v.number() },
  handler: async (context, args): Promise<{ status: "pending" | "expired" | "authenticated"; merchantId?: string; ownerWaIdHash?: string; intent?: "website" | "reels" | "both" }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.completeStudioLinkInternal, record);
  },
});

export const adminGetStudioSession = query({
  args: { serviceSecret: v.string(), sessionHash: v.string(), now: v.number() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const session = await context.db.query("studioSessions").withIndex("by_session_hash", (range) => range.eq("sessionHash", args.sessionHash)).unique();
    if (!session || session.revokedAt || session.expiresAt < args.now) return null;
    return { merchantId: session.merchantId, ownerWaIdHash: session.ownerWaIdHash, expiresAt: session.expiresAt };
  },
});

export const saveStudioProjectInternal = internalMutation({
  args: {
    projectId: v.string(), revisionId: v.string(), parentRevisionId: v.optional(v.string()), merchantId: v.string(),
    intent: v.union(v.literal("website"), v.literal("reels"), v.literal("both")), projectJson: v.string(), createdAt: v.number(),
  },
  handler: async (context, args) => {
    const existingRevision = await context.db.query("studioProjects").withIndex("by_project_revision", (range) => range.eq("projectId", args.projectId).eq("revisionId", args.revisionId)).unique();
    if (existingRevision) return { inserted: false };
    const projectRevisions = (await context.db.query("studioProjects").withIndex("by_merchant_created", (range) => range.eq("merchantId", args.merchantId)).collect()).filter((entry) => entry.projectId === args.projectId);
    if (projectRevisions.length && !args.parentRevisionId) throw new Error("studio project revision requires a parent");
    if (args.parentRevisionId && !projectRevisions.some((entry) => entry.revisionId === args.parentRevisionId)) throw new Error("studio project parent revision not found");
    await context.db.insert("studioProjects", args);
    return { inserted: true };
  },
});

export const adminSaveStudioProject = action({
  args: {
    serviceSecret: v.string(), projectId: v.string(), revisionId: v.string(), parentRevisionId: v.optional(v.string()), merchantId: v.string(),
    intent: v.union(v.literal("website"), v.literal("reels"), v.literal("both")), projectJson: v.string(), createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.saveStudioProjectInternal, record);
  },
});

export const adminListStudioProjects = query({
  args: { serviceSecret: v.string(), merchantId: v.string() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const revisions = await context.db.query("studioProjects").withIndex("by_merchant_created", (range) => range.eq("merchantId", args.merchantId)).order("desc").collect();
    const latest = new Map<string, typeof revisions[number]>();
    for (const revision of revisions) if (!latest.has(revision.projectId)) latest.set(revision.projectId, revision);
    return Array.from(latest.values()).map((entry) => ({
      projectId: entry.projectId, revisionId: entry.revisionId, parentRevisionId: entry.parentRevisionId,
      intent: entry.intent, projectJson: entry.projectJson, createdAt: entry.createdAt,
    }));
  },
});

export const getPublishedSite = query({
  args: { slug: v.string() },
  handler: async (context, { slug }) => {
    const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", slug)).unique();
    if (!site?.productionVersionId) return null;
    const version = await context.db
      .query("siteVersions")
      .withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", site.productionVersionId!))
      .unique();
    if (!version) throw new Error("production pointer references a missing immutable version");
    const release = await context.db
      .query("releases")
      .withIndex("by_site_created", (range) => range.eq("siteId", site._id))
      .order("desc")
      .first();
    const passportState = release?.decision === "promote" && release.versionId === version.versionId && release.specHash === version.specHash ? "green" : "gray";
    return { specJson: version.specJson, versionId: version.versionId, specHash: version.specHash, passportState };
  },
});

export const getPublicAsset = query({
  args: { assetId: v.string() },
  handler: async (context, { assetId }) => {
    const asset = await context.db.query("mediaAssets").withIndex("by_asset_id", (range) => range.eq("assetId", assetId)).unique();
    if (!asset) return null;
    const sites = await context.db.query("sites").collect();
    for (const site of sites) {
      if (!site.productionVersionId) continue;
      const version = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", site.productionVersionId!)).unique();
      if (!version) continue;
      const spec = JSON.parse(version.specJson) as { hero?: { imageAssetId?: string }; seo?: { socialImageAssetId?: string }; catalog?: Array<{ imageAssetId?: string }> };
      const selected = new Set([spec.hero?.imageAssetId, spec.seo?.socialImageAssetId, ...(spec.catalog ?? []).map((item) => item.imageAssetId)]);
      if (selected.has(assetId)) {
        const storageBackend = asset.storageBackend ?? "r2";
        const storageUrl = storageBackend === "convex" && asset.convexStorageId ? await context.storage.getUrl(asset.convexStorageId) : undefined;
        return { storageBackend, objectKey: asset.objectKey, storageUrl: storageUrl ?? undefined, contentType: asset.contentType, sha256: asset.sha256 };
      }
    }
    return null;
  },
});

export const appendEvent = mutation({
  args: {
    eventId: v.string(),
    type: v.union(v.literal("page_view"), v.literal("whatsapp_cta_click")),
    siteId: v.string(),
    versionId: v.string(),
    specHash: v.string(),
    sessionHash: v.string(),
    itemId: v.optional(v.string()),
    source: v.optional(v.string()),
    campaign: v.optional(v.string()),
    occurredAt: v.number(),
  },
  handler: async (context, args) => {
    const existing = await context.db.query("growthEvents").withIndex("by_event_id", (range) => range.eq("eventId", args.eventId)).unique();
    if (existing) return { inserted: false };
    await context.db.insert("growthEvents", args);
    return { inserted: true };
  },
});

export const resolveApprovalTap = mutation({
  args: {
    approvalId: v.string(),
    decision: v.union(v.literal("approved"), v.literal("denied")),
    senderWaIdHash: v.string(),
    providerMessageId: v.string(),
  },
  handler: async (context, args) => {
    const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", args.approvalId)).unique();
    if (!approval || approval.decision !== "pending" || approval.expiresAt < Date.now()) return { accepted: false };
    if (approval.ownerWaIdHash !== args.senderWaIdHash) return { accepted: false };
    await context.db.patch(approval._id, { decision: args.decision, decidedAt: Date.now(), providerMessageId: args.providerMessageId });
    return { accepted: true };
  },
});

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length <= 500 ? value : undefined;
}

export const ingestVapiReport = mutation({
  args: { payloadJson: v.string() },
  handler: async (context, { payloadJson }) => {
    const payload = JSON.parse(payloadJson) as any;
    const message = payload?.message;
    if (message?.type !== "end-of-call-report") return { accepted: true };
    const providerCallId = optionalString(message.call?.id);
    const batchId = optionalString(message.call?.metadata?.batchId);
    const leadId = optionalString(message.call?.metadata?.leadId);
    if (!providerCallId || !batchId || !leadId) return { accepted: false };
    const existing = await context.db.query("callOutcomes").withIndex("by_provider_call_id", (range) => range.eq("providerCallId", providerCallId)).unique();
    if (existing) return { accepted: true };
    const structured = message.analysis?.structuredData ?? {};
    const consent = message.compliance?.recordingConsent?.grantedAt ? "granted" : structured.recordingConsent === "declined" ? "declined" : "not_reached";
    const outcomeValues = new Set(["qualified", "not_interested", "no_answer", "failed", "do_not_call"]);
    const outcome = outcomeValues.has(structured.outcome) ? structured.outcome : "failed";
    const doNotCall = Boolean(structured.doNotCall || outcome === "do_not_call");
    await context.db.insert("callOutcomes", {
      providerCallId, batchId, leadId, recordingConsent: consent, outcome,
      interest: optionalString(structured.interest), timing: optionalString(structured.timing), product: optionalString(structured.product),
      objection: optionalString(structured.objection), followUpRequested: Boolean(structured.followUpRequested), doNotCall,
      costUsd: typeof message.cost === "number" && message.cost >= 0 ? message.cost : 0,
      artifactRef: optionalString(message.call?.metadata?.artifactRef),
      completedAt: Number.isFinite(Date.parse(message.endedAt)) ? Date.parse(message.endedAt) : Date.now(),
    });
    if (doNotCall) {
      const lead = await context.db.query("leadConsents").withIndex("by_lead_id", (range) => range.eq("leadId", leadId)).unique();
      if (lead && !lead.revokedAt) await context.db.patch(lead._id, { revokedAt: Date.now() });
    }
    return { accepted: true };
  },
});

export const metricsSummary = query({
  args: { serviceSecret: v.string(), merchantId: v.string(), siteId: v.string(), since: v.number() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", args.siteId)).unique();
    if (!site || site.merchantId !== args.merchantId) throw new Error("site tenant mismatch");
    const events = await context.db.query("growthEvents").withIndex("by_site_time", (range) => range.eq("siteId", args.siteId).gte("occurredAt", args.since)).collect();
    const views = events.filter((event) => event.type === "page_view").length;
    const clicks = events.filter((event) => event.type === "whatsapp_cta_click").length;
    return { views, clicks, clickThroughRate: views === 0 ? 0 : clicks / views, since: args.since, through: Date.now() };
  },
});

export const upsertMerchantInternal = internalMutation({
  args: { merchantId: v.string(), ownerWaIdHash: v.string(), name: v.string(), timezone: v.string(), orderWhatsAppNumberCiphertext: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    const existing = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (existing) {
      if (existing.ownerWaIdHash !== args.ownerWaIdHash) throw new Error("merchant owner identity is immutable");
      return { merchantId: existing._id, inserted: false };
    }
    return { merchantId: await context.db.insert("merchants", args), inserted: true };
  },
});

export const adminUpsertMerchant = action({
  args: { serviceSecret: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(), name: v.string(), timezone: v.string(), orderWhatsAppNumberCiphertext: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    const result = await context.runMutation(internal.growth.upsertMerchantInternal, record);
    return { inserted: result.inserted };
  },
});

export const appendDecisionPolicyInternal = internalMutation({
  args: {
    policyId: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(), policyJson: v.string(),
    policyHash: v.string(), supersedesPolicyId: v.optional(v.string()), createdAt: v.number(),
  },
  handler: async (context, args) => {
    const merchant = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (!merchant || merchant.ownerWaIdHash !== args.ownerWaIdHash) throw new Error("decision policy owner does not match merchant");
    const duplicate = await context.db.query("decisionPolicies").withIndex("by_policy_id", (range) => range.eq("policyId", args.policyId)).unique();
    if (duplicate) {
      if (duplicate.policyHash !== args.policyHash) throw new Error("immutable decision policy conflict");
      return { inserted: false };
    }
    const active = await context.db.query("decisionPolicies").withIndex("by_merchant_created", (range) => range.eq("merchantId", args.merchantId)).order("desc").first();
    if (active && args.supersedesPolicyId !== active.policyId) throw new Error("new policy must supersede the active policy");
    if (!active && args.supersedesPolicyId) throw new Error("first policy cannot supersede a missing policy");
    if (active && args.createdAt <= active.createdAt) throw new Error("new policy timestamp must follow the active policy");
    await context.db.insert("decisionPolicies", args);
    return { inserted: true };
  },
});

export const adminAppendDecisionPolicy = action({
  args: {
    serviceSecret: v.string(), policyId: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(),
    policyJson: v.string(), policyHash: v.string(), supersedesPolicyId: v.optional(v.string()), createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.appendDecisionPolicyInternal, record);
  },
});

export const adminGetActiveDecisionPolicy = query({
  args: { serviceSecret: v.string(), merchantId: v.string() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const policy = await context.db.query("decisionPolicies").withIndex("by_merchant_created", (range) => range.eq("merchantId", args.merchantId)).order("desc").first();
    return policy ? { policyJson: policy.policyJson, policyHash: policy.policyHash } : null;
  },
});

export const adminGetPreviewSite = query({
  args: { serviceSecret: v.string(), siteId: v.string(), versionId: v.string(), specHash: v.string() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", args.siteId)).unique();
    if (!site || site.canaryVersionId !== args.versionId) return null;
    const version = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", args.versionId)).unique();
    if (!version || version.specHash !== args.specHash) return null;
    return { specJson: version.specJson, versionId: version.versionId, specHash: version.specHash };
  },
});

export const createCandidateInternal = internalMutation({
  args: { merchantId: v.string(), slug: v.string(), versionId: v.string(), parentVersionId: v.optional(v.string()), specJson: v.string(), specHash: v.string(), actor: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    const merchant = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (!merchant) throw new Error("merchant does not exist");
    let site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", args.slug)).unique();
    if (!site) {
      const siteId = await context.db.insert("sites", { merchantId: args.merchantId, slug: args.slug, createdAt: args.createdAt, updatedAt: args.createdAt });
      site = await context.db.get(siteId);
    }
    if (!site) throw new Error("site creation failed");
    if (site.merchantId !== args.merchantId) throw new Error("site slug belongs to another merchant");
    const existing = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site!._id).eq("versionId", args.versionId)).unique();
    if (existing && (existing.specHash !== args.specHash || existing.specJson !== args.specJson)) throw new Error("immutable version conflict");
    const siteVersionId = existing?._id ?? await context.db.insert("siteVersions", { siteId: site._id, versionId: args.versionId, parentVersionId: args.parentVersionId, specJson: args.specJson, specHash: args.specHash, actor: args.actor, createdAt: args.createdAt });
    await context.db.patch(site._id, { canaryVersionId: args.versionId, updatedAt: args.createdAt });
    return { siteId: site._id, siteVersionId, inserted: !existing };
  },
});

export const adminCreateCandidate = action({
  args: { serviceSecret: v.string(), merchantId: v.string(), slug: v.string(), versionId: v.string(), parentVersionId: v.optional(v.string()), specJson: v.string(), specHash: v.string(), actor: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    const result = await context.runMutation(internal.growth.createCandidateInternal, record);
    return { inserted: result.inserted };
  },
});

export const registerLeadInternal = internalMutation({
  args: { merchantId: v.string(), leadId: v.string(), phoneCiphertext: v.string(), phoneHash: v.string(), country: v.union(v.literal("IN"), v.literal("US")), purpose: v.literal("ai_qualification_call"), source: v.string(), evidenceHash: v.string(), grantedAt: v.number(), revokedAt: v.optional(v.number()), localTimezone: v.string(), callWindowStartHour: v.number(), callWindowEndHour: v.number(), createdAt: v.number() },
  handler: async (context, args) => {
    const merchant = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (!merchant) throw new Error("merchant does not exist");
    const existing = await context.db.query("leadConsents").withIndex("by_lead_id", (range) => range.eq("leadId", args.leadId)).unique();
    if (existing) {
      if (existing.evidenceHash !== args.evidenceHash || existing.phoneHash !== args.phoneHash) throw new Error("immutable lead consent conflict");
      return { inserted: false };
    }
    await context.db.insert("leadConsents", args);
    return { inserted: true };
  },
});

export const adminRegisterLead = action({
  args: { serviceSecret: v.string(), merchantId: v.string(), leadId: v.string(), phoneCiphertext: v.string(), phoneHash: v.string(), country: v.union(v.literal("IN"), v.literal("US")), purpose: v.literal("ai_qualification_call"), source: v.string(), evidenceHash: v.string(), grantedAt: v.number(), revokedAt: v.optional(v.number()), localTimezone: v.string(), callWindowStartHour: v.number(), callWindowEndHour: v.number(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.registerLeadInternal, record);
  },
});

export const createApprovalInternal = internalMutation({
  args: { approvalId: v.string(), merchantId: v.string(), type: v.union(v.literal("release"), v.literal("call_batch"), v.literal("reel"), v.literal("social_campaign")), scopeHash: v.string(), providerMessageId: v.string(), expiresAt: v.number(), createdAt: v.number() },
  handler: async (context, args) => {
    const merchant = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (!merchant) throw new Error("merchant does not exist");
    const existing = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", args.approvalId)).unique();
    if (existing) throw new Error("approval ID already exists");
    await context.db.insert("approvals", { ...args, ownerWaIdHash: merchant.ownerWaIdHash, decision: "pending" });
    return { ownerWaIdHash: merchant.ownerWaIdHash };
  },
});

export const attachApprovalMessageInternal = internalMutation({
  args: { approvalId: v.string(), providerMessageId: v.string() },
  handler: async (context, args) => {
    const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", args.approvalId)).unique();
    if (!approval || approval.decision !== "pending") throw new Error("pending approval not found");
    await context.db.patch(approval._id, { providerMessageId: args.providerMessageId });
  },
});

export const adminCreateApproval = action({
  args: { serviceSecret: v.string(), approvalId: v.string(), merchantId: v.string(), type: v.union(v.literal("release"), v.literal("call_batch"), v.literal("reel"), v.literal("social_campaign")), scopeHash: v.string(), providerMessageId: v.string(), expiresAt: v.number(), createdAt: v.number() },
  handler: async (context, args): Promise<{ ownerWaIdHash: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.createApprovalInternal, record);
  },
});

export const resolveStudioApprovalInternal = internalMutation({
  args: {
    approvalId: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(),
    decision: v.union(v.literal("approved"), v.literal("denied")), providerMessageId: v.string(), now: v.number(),
  },
  handler: async (context, args) => {
    const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", args.approvalId)).unique();
    if (!approval || (approval.type !== "release" && approval.type !== "reel") || approval.decision !== "pending" || approval.expiresAt < args.now) return { accepted: false as const };
    if (approval.merchantId !== args.merchantId || approval.ownerWaIdHash !== args.ownerWaIdHash) return { accepted: false };
    await context.db.patch(approval._id, { decision: args.decision, decidedAt: args.now, providerMessageId: args.providerMessageId });
    const reel = approval.type === "reel" ? (await context.db.query("reelPlans").collect()).find((entry) => entry.approvalId === approval.approvalId) : undefined;
    return { accepted: true as const, type: approval.type, reelId: reel?.reelId };
  },
});

export const adminResolveStudioApproval = action({
  args: {
    serviceSecret: v.string(), approvalId: v.string(), merchantId: v.string(), ownerWaIdHash: v.string(),
    decision: v.union(v.literal("approved"), v.literal("denied")), providerMessageId: v.string(), now: v.number(),
  },
  handler: async (context, args): Promise<{ accepted: boolean; type?: "release" | "reel"; reelId?: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.resolveStudioApprovalInternal, record);
  },
});

export const registerSocialCampaignInternal = internalMutation({
  args: { campaignId: v.string(), merchantId: v.string(), campaignJson: v.string(), scopeHash: v.string(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    const merchant = await context.db.query("merchants").withIndex("by_merchant_id", (range) => range.eq("merchantId", args.merchantId)).unique();
    if (!merchant) throw new Error("merchant does not exist");
    const existing = await context.db.query("socialCampaigns").withIndex("by_campaign_id", (range) => range.eq("campaignId", args.campaignId)).unique();
    if (existing) {
      if (existing.scopeHash !== args.scopeHash) throw new Error("immutable social campaign conflict");
      return { inserted: false };
    }
    await context.db.insert("socialCampaigns", { ...args, status: "pending_approval" });
    return { inserted: true };
  },
});

export const adminRegisterSocialCampaign = action({
  args: { serviceSecret: v.string(), campaignId: v.string(), merchantId: v.string(), campaignJson: v.string(), scopeHash: v.string(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.registerSocialCampaignInternal, record);
  },
});

export const adminAttachApprovalMessage = action({
  args: { serviceSecret: v.string(), approvalId: v.string(), providerMessageId: v.string() },
  handler: async (context, args): Promise<{ attached: true }> => {
    requireServiceSecret(args.serviceSecret);
    await context.runMutation(internal.growth.attachApprovalMessageInternal, { approvalId: args.approvalId, providerMessageId: args.providerMessageId });
    return { attached: true };
  },
});

export const createCallBatchInternal = internalMutation({
  args: { batchId: v.string(), merchantId: v.string(), scopeHash: v.string(), leadIds: v.array(v.string()), countries: v.array(v.union(v.literal("IN"), v.literal("US"))), scriptVersion: v.string(), earliestAt: v.number(), latestAt: v.number(), maxAttemptsPerLead: v.number(), costCapUsd: v.number(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    for (const leadId of args.leadIds) {
      const lead = await context.db.query("leadConsents").withIndex("by_lead_id", (range) => range.eq("leadId", leadId)).unique();
      if (!lead || lead.merchantId !== args.merchantId || lead.revokedAt || !args.countries.includes(lead.country)) throw new Error(`lead ${leadId} is not eligible`);
    }
    await context.db.insert("callBatches", args);
    return { inserted: true };
  },
});

export const adminCreateCallBatch = action({
  args: { serviceSecret: v.string(), batchId: v.string(), merchantId: v.string(), scopeHash: v.string(), leadIds: v.array(v.string()), countries: v.array(v.union(v.literal("IN"), v.literal("US"))), scriptVersion: v.string(), earliestAt: v.number(), latestAt: v.number(), maxAttemptsPerLead: v.number(), costCapUsd: v.number(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.createCallBatchInternal, record);
  },
});

export const registerReelInternal = internalMutation({
  args: { reelId: v.string(), merchantId: v.string(), planJson: v.string(), planHash: v.string(), approvalId: v.string(), status: v.literal("draft"), createdAt: v.number() },
  handler: async (context, args) => {
    const existing = await context.db.query("reelPlans").withIndex("by_reel_id", (range) => range.eq("reelId", args.reelId)).unique();
    if (existing) throw new Error("reel ID already exists");
    await context.db.insert("reelPlans", args);
    return { inserted: true };
  },
});

export const adminRegisterReel = action({
  args: { serviceSecret: v.string(), reelId: v.string(), merchantId: v.string(), planJson: v.string(), planHash: v.string(), approvalId: v.string(), status: v.literal("draft"), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.registerReelInternal, record);
  },
});

export const registerAssetInternal = internalMutation({
  args: { assetId: v.string(), merchantId: v.string(), storageBackend: v.union(v.literal("r2"), v.literal("convex")), objectKey: v.optional(v.string()), convexStorageId: v.optional(v.id("_storage")), sha256: v.string(), contentType: v.string(), byteLength: v.number(), sourceProviderMessageId: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    if (args.storageBackend === "r2" && !args.objectKey) throw new Error("R2 asset requires an object key");
    if (args.storageBackend === "convex" && !args.convexStorageId) throw new Error("Convex asset requires a storage ID");
    const existing = await context.db.query("mediaAssets").withIndex("by_asset_id", (range) => range.eq("assetId", args.assetId)).unique();
    const shouldInsert = assertImmutableAssetRegistration(existing, args);
    if (!shouldInsert) return { inserted: false };
    if (args.storageBackend === "convex") {
      const metadata = await context.db.system.get("_storage", args.convexStorageId!);
      validateStoredAssetMetadata(metadata, args);
    }
    await context.db.insert("mediaAssets", args);
    return { inserted: true };
  },
});

export const adminRegisterAsset = action({
  args: { serviceSecret: v.string(), assetId: v.string(), merchantId: v.string(), storageBackend: v.union(v.literal("r2"), v.literal("convex")), objectKey: v.optional(v.string()), convexStorageId: v.optional(v.id("_storage")), sha256: v.string(), contentType: v.string(), byteLength: v.number(), sourceProviderMessageId: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ inserted: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.registerAssetInternal, record);
  },
});

export const adminPrepareAssetUpload = mutation({
  args: { serviceSecret: v.string(), assetId: v.string(), merchantId: v.string(), sha256: v.string() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const existing = await context.db.query("mediaAssets").withIndex("by_asset_id", (range) => range.eq("assetId", args.assetId)).unique();
    if (existing) {
      if (existing.sha256 !== args.sha256 || existing.merchantId !== args.merchantId || (existing.storageBackend ?? "r2") !== "convex") throw new Error("immutable asset conflict");
      return { existing: true as const };
    }
    return { existing: false as const, uploadUrl: await context.storage.generateUploadUrl() };
  },
});

export const adminGetAssetForDelivery = query({
  args: { serviceSecret: v.string(), assetId: v.string(), merchantId: v.optional(v.string()) },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const asset = await context.db.query("mediaAssets").withIndex("by_asset_id", (range) => range.eq("assetId", args.assetId)).unique();
    if (!asset || (args.merchantId && asset.merchantId !== args.merchantId)) return null;
    const storageBackend = asset.storageBackend ?? "r2";
    const storageUrl = storageBackend === "convex" && asset.convexStorageId ? await context.storage.getUrl(asset.convexStorageId) : undefined;
    return { storageBackend, objectKey: asset.objectKey, storageUrl: storageUrl ?? undefined, contentType: asset.contentType, sha256: asset.sha256 };
  },
});

export const mintVerificationCapabilityInternal = internalMutation({
  args: { tokenHash: v.string(), merchantId: v.string(), siteId: v.string(), versionId: v.string(), specHash: v.string(), expiresAt: v.number(), createdAt: v.number() },
  handler: async (context, args) => {
    const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", args.siteId)).unique();
    if (!site || site.canaryVersionId !== args.versionId) throw new Error("candidate is not the current canary");
    if (site.merchantId !== args.merchantId) throw new Error("site tenant mismatch");
    const version = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", args.versionId)).unique();
    if (!version || version.specHash !== args.specHash) throw new Error("candidate hash mismatch");
    await context.db.insert("verificationCapabilities", args);
    return { created: true };
  },
});

export const adminMintVerificationCapability = action({
  args: { serviceSecret: v.string(), tokenHash: v.string(), merchantId: v.string(), siteId: v.string(), versionId: v.string(), specHash: v.string(), expiresAt: v.number(), createdAt: v.number() },
  handler: async (context, args): Promise<{ created: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.mintVerificationCapabilityInternal, record);
  },
});

export const submitGrowthVerification = mutation({
  args: { tokenHash: v.string(), evidenceId: v.string(), siteId: v.string(), versionId: v.string(), specHash: v.string(), runId: v.string(), reportHash: v.string(), passed: v.boolean(), blockers: v.array(v.string()), observedAt: v.number() },
  handler: async (context, args) => {
    const capability = await context.db.query("verificationCapabilities").withIndex("by_token_hash", (range) => range.eq("tokenHash", args.tokenHash)).unique();
    if (!capability || capability.consumedAt || capability.expiresAt < Date.now()) return { accepted: false };
    if (capability.siteId !== args.siteId || capability.versionId !== args.versionId || capability.specHash !== args.specHash) return { accepted: false };
    const duplicate = await context.db.query("growthVerifications").withIndex("by_evidence_id", (range) => range.eq("evidenceId", args.evidenceId)).unique();
    if (duplicate) return { accepted: false };
    await context.db.patch(capability._id, { consumedAt: Date.now() });
    const { tokenHash: _token, ...evidence } = args;
    await context.db.insert("growthVerifications", evidence);
    return { accepted: true };
  },
});

export const createGrowthReleaseRequestInternal = internalMutation({
  args: { requestId: v.string(), siteId: v.string(), merchantId: v.string(), versionId: v.string(), specHash: v.string(), scopeHash: v.string(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args) => {
    const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", args.siteId)).unique();
    if (!site || site.canaryVersionId !== args.versionId) throw new Error("candidate is not the current canary");
    if (site.merchantId !== args.merchantId) throw new Error("site tenant mismatch");
    const version = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", args.versionId)).unique();
    if (!version || version.specHash !== args.specHash) throw new Error("candidate hash mismatch");
    const verifications = await context.db.query("growthVerifications").withIndex("by_site_version", (range) => range.eq("siteId", args.siteId).eq("versionId", args.versionId)).order("desc").collect();
    const verification = verifications.find((entry) => entry.specHash === args.specHash && entry.passed && entry.blockers.length === 0);
    if (!verification) throw new Error("passing verification with no blockers is required");
    const spec = JSON.parse(version.specJson) as { business?: { merchantId?: string } };
    if (spec.business?.merchantId !== args.merchantId) throw new Error("candidate merchant mismatch");
    await context.db.insert("growthReleaseRequests", { ...args, verificationRunId: verification.runId, status: "pending" });
    return { verificationRunId: verification.runId };
  },
});

export const adminCreateGrowthReleaseRequest = action({
  args: { serviceSecret: v.string(), requestId: v.string(), siteId: v.string(), merchantId: v.string(), versionId: v.string(), specHash: v.string(), scopeHash: v.string(), approvalId: v.string(), createdAt: v.number() },
  handler: async (context, args): Promise<{ verificationRunId: string }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.createGrowthReleaseRequestInternal, record);
  },
});

export const promoteApprovedGrowthReleaseInternal = internalMutation({
  args: { now: v.number() },
  handler: async (context, { now }) => {
    const requests = await context.db.query("growthReleaseRequests").order("asc").collect();
    for (const request of requests) {
      if (request.status !== "pending") continue;
      const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", request.approvalId)).unique();
      if (!approval || approval.type !== "release" || approval.decision !== "approved" || approval.expiresAt < now || approval.scopeHash !== request.scopeHash || approval.merchantId !== request.merchantId) continue;
      const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", request.siteId)).unique();
      if (!site || site.canaryVersionId !== request.versionId) { await context.db.patch(request._id, { status: "blocked", completedAt: now }); continue; }
      const version = await context.db.query("siteVersions").withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", request.versionId)).unique();
      const verification = (await context.db.query("growthVerifications").withIndex("by_site_version", (range) => range.eq("siteId", request.siteId).eq("versionId", request.versionId)).collect()).find((entry) => entry.runId === request.verificationRunId);
      if (!version || version.specHash !== request.specHash || !verification?.passed || verification.blockers.length) { await context.db.patch(request._id, { status: "blocked", completedAt: now }); continue; }
      await context.db.patch(site._id, { previousCertifiedVersionId: site.productionVersionId, productionVersionId: request.versionId, updatedAt: now });
      await context.db.insert("releases", { siteId: site._id, versionId: request.versionId, specHash: request.specHash, decision: "promote", previousVersionId: site.productionVersionId, reason: `approved:${request.approvalId};verified:${request.verificationRunId}`, createdAt: now });
      await context.db.patch(request._id, { status: "promoted", completedAt: now });
      return { promoted: true, siteId: request.siteId, versionId: request.versionId };
    }
    return { promoted: false };
  },
});

export const adminPromoteApprovedGrowthRelease = action({
  args: { serviceSecret: v.string(), now: v.number() },
  handler: async (context, args): Promise<{ promoted: boolean; siteId?: string; versionId?: string }> => {
    requireServiceSecret(args.serviceSecret);
    return context.runMutation(internal.growth.promoteApprovedGrowthReleaseInternal, { now: args.now });
  },
});

export const claimApprovedCallBatchInternal = internalMutation({
  args: { now: v.number() },
  handler: async (context, { now }) => {
    const batches = await context.db.query("callBatches").order("asc").collect();
    for (const batch of batches) {
      if (batch.dispatchedAt || batch.earliestAt > now || batch.latestAt < now) continue;
      const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", batch.approvalId)).unique();
      if (!approval || approval.type !== "call_batch" || approval.decision !== "approved" || approval.expiresAt < now || approval.scopeHash !== batch.scopeHash) continue;
      const leads = [];
      let eligible = true;
      for (const leadId of batch.leadIds) {
        const lead = await context.db.query("leadConsents").withIndex("by_lead_id", (range) => range.eq("leadId", leadId)).unique();
        if (!lead || lead.merchantId !== batch.merchantId || lead.revokedAt || !batch.countries.includes(lead.country)) { eligible = false; break; }
        leads.push({ leadId: lead.leadId, phoneCiphertext: lead.phoneCiphertext });
      }
      if (!eligible) continue;
      // Claim before the provider call. A failed provider request is still the one allowed attempt.
      await context.db.patch(batch._id, { dispatchedAt: now });
      return { batchId: batch.batchId, earliestAt: batch.earliestAt, leads };
    }
    return null;
  },
});

export const adminClaimApprovedCallBatch = action({
  args: { serviceSecret: v.string(), now: v.number() },
  handler: async (context, args): Promise<null | { batchId: string; earliestAt: number; leads: Array<{ leadId: string; phoneCiphertext: string }> }> => {
    requireServiceSecret(args.serviceSecret);
    return context.runMutation(internal.growth.claimApprovedCallBatchInternal, { now: args.now });
  },
});

export const claimApprovedReelInternal = internalMutation({
  args: { now: v.number() },
  handler: async (context, { now }) => {
    const reels = await context.db.query("reelPlans").order("asc").collect();
    for (const reel of reels) {
      if (reel.status !== "draft" || !reel.approvalId) continue;
      const approval = await context.db.query("approvals").withIndex("by_approval_id", (range) => range.eq("approvalId", reel.approvalId!)).unique();
      if (!approval || approval.type !== "reel" || approval.decision !== "approved" || approval.expiresAt < now || approval.scopeHash !== reel.planHash) continue;
      await context.db.patch(reel._id, { status: "rendering" });
      return { reelId: reel.reelId, planJson: reel.planJson, planHash: reel.planHash };
    }
    return null;
  },
});

export const adminClaimApprovedReel = action({
  args: { serviceSecret: v.string(), now: v.number() },
  handler: async (context, args): Promise<null | { reelId: string; planJson: string; planHash: string }> => {
    requireServiceSecret(args.serviceSecret);
    return context.runMutation(internal.growth.claimApprovedReelInternal, { now: args.now });
  },
});

export const completeReelInternal = internalMutation({
  args: { reelId: v.string(), status: v.union(v.literal("rendered"), v.literal("failed")), renderedAssetId: v.optional(v.string()), deliveredProviderMessageId: v.optional(v.string()) },
  handler: async (context, args) => {
    const reel = await context.db.query("reelPlans").withIndex("by_reel_id", (range) => range.eq("reelId", args.reelId)).unique();
    if (!reel || reel.status !== "rendering") throw new Error("claimed reel not found");
    if (args.status === "rendered" && !args.renderedAssetId) throw new Error("rendered asset is required");
    await context.db.patch(reel._id, { status: args.status, renderedAssetId: args.renderedAssetId, deliveredProviderMessageId: args.deliveredProviderMessageId, deliveredAt: args.deliveredProviderMessageId ? Date.now() : undefined });
    return { completed: true };
  },
});

export const adminCompleteReel = action({
  args: { serviceSecret: v.string(), reelId: v.string(), status: v.union(v.literal("rendered"), v.literal("failed")), renderedAssetId: v.optional(v.string()), deliveredProviderMessageId: v.optional(v.string()) },
  handler: async (context, args): Promise<{ completed: boolean }> => {
    requireServiceSecret(args.serviceSecret);
    const { serviceSecret: _secret, ...record } = args;
    return context.runMutation(internal.growth.completeReelInternal, record);
  },
});

export const adminGetReelStatus = query({
  args: { serviceSecret: v.string(), reelId: v.string(), merchantId: v.string() },
  handler: async (context, args) => {
    requireServiceSecret(args.serviceSecret);
    const reel = await context.db.query("reelPlans").withIndex("by_reel_id", (range) => range.eq("reelId", args.reelId)).unique();
    if (!reel || reel.merchantId !== args.merchantId) return null;
    return { status: reel.status, renderedAssetId: reel.renderedAssetId };
  },
});
