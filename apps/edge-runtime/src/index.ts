import { Hono } from "hono";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { initialSpikeSiteSpec, SiteSpecSchema } from "../../../packages/domain/src/site-spec";
import { BusinessBriefInputSchema, BusinessBriefSchema, LeadConsentSchema, ReelPlanSchema, SiteSpecV2Schema, type BusinessBriefV1, type LeadConsentV1, type ReelPlanV1, type SiteSpecV2 } from "../../../packages/domain/src/growth";
import { deriveTenantIdentity, tenantScopedAssetId } from "../../../packages/domain/src/tenant";
import { DecisionPolicySchema, DecisionRequestSchema, evaluateDecision, type DecisionPolicyV1 } from "../../../packages/domain/src/decision-policy";
import { renderBusinessSite } from "../../../packages/renderer/src/render-bakery-site";
import { renderProductHome } from "../../../packages/renderer/src/render-product-home";
import { renderDataDeletion, renderPrivacyPolicy, renderTermsOfService } from "../../../packages/renderer/src/render-legal";
import { renderSite } from "../../../packages/renderer/src/render-site";
import { authenticateVapiWebhook } from "../../../packages/calls/src/vapi";
import { createQualificationCalls } from "../../../packages/calls/src/vapi-client";
import { createCallBatch, type CallBatch } from "../../../packages/release-policy/src/growth-policy";
import { createSocialCampaign, type SocialCampaign } from "../../../packages/social/src/experiment";
import { sendActionRequiredTemplate, sendApprovalButtons, sendVideoByMediaId, uploadMetaMedia } from "../../../packages/whatsapp-io/src/meta-client";
import { extractProofGateApproval, verifyMetaWebhookSignature } from "../../../packages/whatsapp-io/src/meta-webhook";

type Bindings = {
  CONVEX_URL?: string;
  META_APP_SECRET?: string;
  META_VERIFY_TOKEN?: string;
  VAPI_WEBHOOK_SECRET?: string;
  VAPI_API_KEY?: string;
  VAPI_PHONE_NUMBER_ID?: string;
  VAPI_SQUAD_ID?: string;
  HERMES_ORIGIN_URL?: string;
  HERMES_PROXY_SECRET?: string;
  PROOFGATE_SERVICE_SECRET?: string;
  PROOFGATE_DATA_KEY?: string;
  META_GRAPH_API_VERSION?: string;
  META_PHONE_NUMBER_ID?: string;
  META_ACCESS_TOKEN?: string;
  META_ACTION_REQUIRED_TEMPLATE?: string;
  PROOFGATE_ASSETS?: R2Bucket;
  PROOFGATE_CONFIG?: KVNamespace;
};
type AcknowledgmentResult = { inserted: boolean; passportState: "amber" | "green" };
type EvidenceBoundary = {
  acknowledge: (token: string, convexUrl?: string) => Promise<AcknowledgmentResult>;
};

export type GrowthEvent = {
  eventId: string;
  type: "page_view" | "whatsapp_cta_click";
  siteId: string;
  versionId: string;
  specHash: string;
  sessionHash: string;
  itemId?: string;
  source?: string;
  campaign?: string;
  occurredAt: number;
};

export type GrowthBoundary = {
  getPublishedSite: (slug: string, bindings?: Bindings) => Promise<{ spec: SiteSpecV2; versionId: string; specHash: string; passportState: "gray" | "amber" | "green" | "red" } | null>;
  appendEvent: (event: GrowthEvent, bindings?: Bindings) => Promise<void>;
  resolveApproval: (tap: NonNullable<ReturnType<typeof extractProofGateApproval>>, bindings?: Bindings) => Promise<{ accepted: boolean }>;
  ingestVapiReport: (payload: unknown, bindings?: Bindings) => Promise<{ accepted: boolean }>;
  forwardToHermes: (body: Uint8Array, headers: Headers, bindings?: Bindings) => Promise<Response>;
  getAsset: (assetId: string, bindings?: Bindings) => Promise<{ body: Uint8Array; contentType: string; etag: string } | null>;
  submitVerification: (input: { tokenHash: string; evidenceId: string; siteId: string; versionId: string; specHash: string; runId: string; reportHash: string; passed: boolean; blockers: string[]; observedAt: number }, bindings?: Bindings) => Promise<{ accepted: boolean }>;
};

export type GrowthAdminBoundary = {
  upsertMerchant: (brief: BusinessBriefV1, encryptedOrderNumber: string, bindings?: Bindings) => Promise<unknown>;
  createCandidate: (input: { spec: SiteSpecV2; versionId: string; parentVersionId?: string; specHash: string; actor: string }, bindings?: Bindings) => Promise<unknown>;
  registerLead: (merchantId: string, consent: LeadConsentV1, bindings?: Bindings) => Promise<unknown>;
  createApproval: (input: { approvalId: string; merchantId: string; type: "release" | "call_batch" | "reel" | "social_campaign"; scopeHash: string; expiresAt: number }, bindings?: Bindings) => Promise<unknown>;
  attachApprovalMessage: (approvalId: string, providerMessageId: string, bindings?: Bindings) => Promise<unknown>;
  createCallBatch: (batch: CallBatch, approvalId: string, bindings?: Bindings) => Promise<unknown>;
  registerReel: (plan: ReelPlanV1, planHash: string, approvalId: string, bindings?: Bindings) => Promise<unknown>;
  registerSocialCampaign: (input: { campaign: SocialCampaign; approvalId: string }, bindings?: Bindings) => Promise<unknown>;
  registerAsset: (input: { assetId: string; merchantId: string; storageBackend: "r2" | "convex"; objectKey?: string; convexStorageId?: string; sha256: string; contentType: string; byteLength: number; sourceProviderMessageId: string }, bindings?: Bindings) => Promise<unknown>;
  uploadAsset: (input: { assetId: string; merchantId: string; sha256: string; contentType: string; byteLength: number; sourceProviderMessageId: string; body: Uint8Array }, bindings?: Bindings) => Promise<{ inserted: boolean; storageBackend: "convex" }>;
  getPrivateAsset: (assetId: string, bindings?: Bindings) => Promise<{ body: Uint8Array; contentType: string; etag: string } | null>;
  metrics: (siteId: string, merchantId: string, since: number, bindings?: Bindings) => Promise<unknown>;
  claimCallBatch: (bindings?: Bindings) => Promise<null | { batchId: string; earliestAt: number; leads: Array<{ leadId: string; phoneCiphertext: string }> }>;
  claimReel: (bindings?: Bindings) => Promise<null | { reelId: string; planJson: string; planHash: string }>;
  completeReel: (reelId: string, status: "rendered" | "failed", renderedAssetId: string | undefined, deliveredProviderMessageId?: string, bindings?: Bindings) => Promise<unknown>;
  mintVerification: (input: { tokenHash: string; merchantId: string; siteId: string; versionId: string; specHash: string; expiresAt: number }, bindings?: Bindings) => Promise<unknown>;
  createReleaseRequest: (input: { requestId: string; siteId: string; merchantId: string; versionId: string; specHash: string; scopeHash: string; approvalId: string }, bindings?: Bindings) => Promise<unknown>;
  promoteRelease: (bindings?: Bindings) => Promise<unknown>;
  saveDecisionPolicy: (input: { policy: DecisionPolicyV1; policyHash: string }, bindings?: Bindings) => Promise<unknown>;
  getDecisionPolicy: (merchantId: string, bindings?: Bindings) => Promise<DecisionPolicyV1 | null>;
};

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

const liveEvidenceBoundary: EvidenceBoundary = {
  acknowledge: async (token, convexUrl) => {
    if (!convexUrl) throw new Error("CONVEX_URL is not configured");
    const client = new ConvexHttpClient(convexUrl);
    return client.action(api.oracle.acknowledgeBooking, { token });
  },
};

function cleanDimension(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const cleaned = value.trim().slice(0, 100);
  return /^[a-zA-Z0-9 _.-]+$/.test(cleaned) ? cleaned : undefined;
}

async function sha256Bytes(value: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(Array.from(value)).buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const MAX_ASSET_BYTES = 16 * 1024 * 1024;

function asciiAt(value: Uint8Array, offset: number, expected: string): boolean {
  if (value.byteLength < offset + expected.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (value[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return true;
}

function hasValidAssetSignature(contentType: string, body: Uint8Array): boolean {
  if (contentType === "image/jpeg") return body.byteLength >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
  if (contentType === "image/png") return body.byteLength >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => body[index] === byte);
  if (contentType === "image/webp") return asciiAt(body, 0, "RIFF") && asciiAt(body, 8, "WEBP");
  if (contentType === "video/mp4") return asciiAt(body, 4, "ftyp");
  if (contentType === "audio/ogg") return asciiAt(body, 0, "OggS");
  if (contentType === "audio/mpeg") return asciiAt(body, 0, "ID3") || (body.byteLength >= 2 && body[0] === 0xff && (body[1]! & 0xe0) === 0xe0);
  return false;
}

function sessionIdFromCookie(cookie: string | undefined): string | null {
  const match = /(?:^|;\s*)pgsid=([a-zA-Z0-9-]{8,64})(?:;|$)/.exec(cookie ?? "");
  return match?.[1] ?? null;
}

const liveGrowthBoundary: GrowthBoundary = {
  getPublishedSite: async (slug, bindings) => {
    if (!bindings?.CONVEX_URL) return null;
    const client = new ConvexHttpClient(bindings.CONVEX_URL);
    const result = await client.query((api as any).growth.getPublishedSite, { slug });
    if (!result) return null;
    return { ...result, spec: SiteSpecV2Schema.parse(JSON.parse(result.specJson)) };
  },
  appendEvent: async (event, bindings) => {
    if (!bindings?.CONVEX_URL) throw new Error("CONVEX_URL is not configured");
    const client = new ConvexHttpClient(bindings.CONVEX_URL);
    await client.mutation((api as any).growth.appendEvent, event);
  },
  resolveApproval: async (tap, bindings) => {
    if (!bindings?.CONVEX_URL) throw new Error("CONVEX_URL is not configured");
    const client = new ConvexHttpClient(bindings.CONVEX_URL);
    return client.mutation((api as any).growth.resolveApprovalTap, {
      approvalId: tap.approvalId,
      decision: tap.decision,
      senderWaIdHash: await sha256(tap.senderWaId),
      providerMessageId: tap.providerMessageId,
    });
  },
  ingestVapiReport: async (payload, bindings) => {
    if (!bindings?.CONVEX_URL) throw new Error("CONVEX_URL is not configured");
    const client = new ConvexHttpClient(bindings.CONVEX_URL);
    return client.mutation((api as any).growth.ingestVapiReport, { payloadJson: JSON.stringify(payload) });
  },
  forwardToHermes: async (body, headers, bindings) => {
    const origin = bindings?.HERMES_ORIGIN_URL ?? await bindings?.PROOFGATE_CONFIG?.get("hermes_origin");
    if (!origin || !bindings?.HERMES_PROXY_SECRET) throw new Error("Hermes origin is not configured");
    const forwarded = new Headers({ "content-type": headers.get("content-type") ?? "application/json", "x-proofgate-proxy": bindings.HERMES_PROXY_SECRET });
    const metaSignature = headers.get("x-hub-signature-256");
    if (metaSignature) forwarded.set("x-hub-signature-256", metaSignature);
    return fetch(`${origin.replace(/\/$/, "")}/whatsapp/webhook`, { method: "POST", headers: forwarded, body: new Uint8Array(Array.from(body)).buffer });
  },
  getAsset: async (assetId, bindings) => {
    if (!bindings?.CONVEX_URL) return null;
    const selected = await new ConvexHttpClient(bindings.CONVEX_URL).query((api as any).growth.getPublicAsset, { assetId }) as null | { storageBackend: "r2" | "convex"; objectKey?: string; storageUrl?: string; contentType: string; sha256: string };
    if (!selected) return null;
    if (selected.storageBackend === "r2") {
      if (!bindings.PROOFGATE_ASSETS || !selected.objectKey) return null;
      const object = await bindings.PROOFGATE_ASSETS.get(selected.objectKey);
      if (!object) return null;
      const body = new Uint8Array(await object.arrayBuffer());
      if (await sha256Bytes(body) !== selected.sha256) throw new Error("asset integrity check failed");
      return { body, contentType: selected.contentType, etag: selected.sha256 };
    }
    if (!selected.storageUrl) return null;
    const response = await fetch(selected.storageUrl);
    if (!response.ok) return null;
    const body = new Uint8Array(await response.arrayBuffer());
    if (await sha256Bytes(body) !== selected.sha256) throw new Error("asset integrity check failed");
    return {
      body,
      contentType: selected.contentType,
      etag: selected.sha256,
    };
  },
  submitVerification: async (input, bindings) => {
    if (!bindings?.CONVEX_URL) throw new Error("CONVEX_URL is not configured");
    return new ConvexHttpClient(bindings.CONVEX_URL).mutation((api as any).growth.submitGrowthVerification, input);
  },
};

function adminClient(bindings?: Bindings): ConvexHttpClient {
  if (!bindings?.CONVEX_URL) throw new Error("CONVEX_URL is not configured");
  return new ConvexHttpClient(bindings.CONVEX_URL);
}

function serviceSecret(bindings?: Bindings): string {
  if (!bindings?.PROOFGATE_SERVICE_SECRET) throw new Error("PROOFGATE_SERVICE_SECRET is not configured");
  return bindings.PROOFGATE_SERVICE_SECRET;
}

const liveAdminBoundary: GrowthAdminBoundary = {
  upsertMerchant: (brief, encryptedOrderNumber, bindings) => adminClient(bindings).action((api as any).growth.adminUpsertMerchant, { serviceSecret: serviceSecret(bindings), merchantId: brief.merchantId, ownerWaIdHash: brief.ownerWaIdHash, name: brief.businessName, timezone: brief.timezone, orderWhatsAppNumberCiphertext: encryptedOrderNumber, createdAt: Date.now() }),
  createCandidate: (input, bindings) => adminClient(bindings).action((api as any).growth.adminCreateCandidate, { serviceSecret: serviceSecret(bindings), merchantId: input.spec.business.merchantId, slug: input.spec.siteId, versionId: input.versionId, parentVersionId: input.parentVersionId, specJson: JSON.stringify(input.spec), specHash: input.specHash, actor: input.actor, createdAt: Date.now() }),
  registerLead: (merchantId, consent, bindings) => adminClient(bindings).action((api as any).growth.adminRegisterLead, { serviceSecret: serviceSecret(bindings), merchantId, leadId: consent.leadId, phoneCiphertext: consent.phoneCiphertext, phoneHash: consent.phoneHash, country: consent.country, purpose: consent.purpose, source: consent.source, evidenceHash: consent.evidenceHash, grantedAt: consent.grantedAt, revokedAt: consent.revokedAt, localTimezone: consent.localTimezone, callWindowStartHour: consent.callWindow.startHour, callWindowEndHour: consent.callWindow.endHour, createdAt: Date.now() }),
  createApproval: (input, bindings) => adminClient(bindings).action((api as any).growth.adminCreateApproval, { serviceSecret: serviceSecret(bindings), ...input, providerMessageId: "pending", createdAt: Date.now() }),
  attachApprovalMessage: (approvalId, providerMessageId, bindings) => adminClient(bindings).action((api as any).growth.adminAttachApprovalMessage, { serviceSecret: serviceSecret(bindings), approvalId, providerMessageId }),
  createCallBatch: (batch, approvalId, bindings) => adminClient(bindings).action((api as any).growth.adminCreateCallBatch, { serviceSecret: serviceSecret(bindings), ...batch, approvalId, createdAt: Date.now() }),
  registerReel: (plan, planHash, approvalId, bindings) => adminClient(bindings).action((api as any).growth.adminRegisterReel, { serviceSecret: serviceSecret(bindings), reelId: plan.reelId, merchantId: plan.merchantId, planJson: JSON.stringify(plan), planHash, approvalId, status: "draft", createdAt: Date.now() }),
  registerSocialCampaign: ({ campaign, approvalId }, bindings) => adminClient(bindings).action((api as any).growth.adminRegisterSocialCampaign, {
    serviceSecret: serviceSecret(bindings), campaignId: campaign.campaignId, merchantId: campaign.merchantId,
    campaignJson: JSON.stringify(campaign), scopeHash: campaign.scopeHash, approvalId, createdAt: Date.now(),
  }),
  registerAsset: (input, bindings) => adminClient(bindings).action((api as any).growth.adminRegisterAsset, { serviceSecret: serviceSecret(bindings), ...input, createdAt: Date.now() }),
  uploadAsset: async (input, bindings) => {
    const client = adminClient(bindings);
    const prepared = await client.mutation((api as any).growth.adminPrepareAssetUpload, {
      serviceSecret: serviceSecret(bindings), assetId: input.assetId, merchantId: input.merchantId, sha256: input.sha256,
    }) as { existing: true } | { existing: false; uploadUrl: string };
    if (prepared.existing) return { inserted: false, storageBackend: "convex" };
    const upload = await fetch(prepared.uploadUrl, {
      method: "POST", headers: { "content-type": input.contentType }, body: new Uint8Array(Array.from(input.body)).buffer,
    });
    if (!upload.ok) throw new Error(`Convex asset upload failed with HTTP ${upload.status}`);
    const uploaded = await upload.json() as { storageId?: unknown };
    if (typeof uploaded.storageId !== "string" || uploaded.storageId.length < 10) throw new Error("Convex asset upload returned an invalid storage ID");
    const result = await client.action((api as any).growth.adminRegisterAsset, {
      serviceSecret: serviceSecret(bindings), assetId: input.assetId, merchantId: input.merchantId,
      storageBackend: "convex", convexStorageId: uploaded.storageId, sha256: input.sha256,
      contentType: input.contentType, byteLength: input.byteLength,
      sourceProviderMessageId: input.sourceProviderMessageId, createdAt: Date.now(),
    }) as { inserted: boolean };
    return { inserted: result.inserted, storageBackend: "convex" };
  },
  getPrivateAsset: async (assetId, bindings) => {
    const selected = await adminClient(bindings).query((api as any).growth.adminGetAssetForDelivery, {
      serviceSecret: serviceSecret(bindings), assetId,
    }) as null | { storageBackend: "r2" | "convex"; objectKey?: string; storageUrl?: string; contentType: string; sha256: string };
    if (!selected) return null;
    if (selected.storageBackend === "r2") {
      if (!bindings?.PROOFGATE_ASSETS || !selected.objectKey) return null;
      const object = await bindings.PROOFGATE_ASSETS.get(selected.objectKey);
      if (!object) return null;
      const body = new Uint8Array(await object.arrayBuffer());
      if (await sha256Bytes(body) !== selected.sha256) throw new Error("asset integrity check failed");
      return { body, contentType: selected.contentType, etag: selected.sha256 };
    }
    if (!selected.storageUrl) return null;
    const response = await fetch(selected.storageUrl);
    if (!response.ok) return null;
    const body = new Uint8Array(await response.arrayBuffer());
    if (await sha256Bytes(body) !== selected.sha256) throw new Error("asset integrity check failed");
    return { body, contentType: selected.contentType, etag: selected.sha256 };
  },
  metrics: (siteId, merchantId, since, bindings) => adminClient(bindings).query((api as any).growth.metricsSummary, { serviceSecret: serviceSecret(bindings), siteId, merchantId, since }),
  claimCallBatch: (bindings) => adminClient(bindings).action((api as any).growth.adminClaimApprovedCallBatch, { serviceSecret: serviceSecret(bindings), now: Date.now() }),
  claimReel: (bindings) => adminClient(bindings).action((api as any).growth.adminClaimApprovedReel, { serviceSecret: serviceSecret(bindings), now: Date.now() }),
  completeReel: (reelId, status, renderedAssetId, deliveredProviderMessageId, bindings) => adminClient(bindings).action((api as any).growth.adminCompleteReel, { serviceSecret: serviceSecret(bindings), reelId, status, renderedAssetId, deliveredProviderMessageId }),
  mintVerification: (input, bindings) => adminClient(bindings).action((api as any).growth.adminMintVerificationCapability, { serviceSecret: serviceSecret(bindings), ...input, createdAt: Date.now() }),
  createReleaseRequest: (input, bindings) => adminClient(bindings).action((api as any).growth.adminCreateGrowthReleaseRequest, { serviceSecret: serviceSecret(bindings), ...input, createdAt: Date.now() }),
  promoteRelease: (bindings) => adminClient(bindings).action((api as any).growth.adminPromoteApprovedGrowthRelease, { serviceSecret: serviceSecret(bindings), now: Date.now() }),
  saveDecisionPolicy: ({ policy, policyHash }, bindings) => adminClient(bindings).action((api as any).growth.adminAppendDecisionPolicy, {
    serviceSecret: serviceSecret(bindings), policyId: policy.policyId, merchantId: policy.merchantId,
    ownerWaIdHash: policy.ownerWaIdHash, policyJson: JSON.stringify(policy), policyHash,
    supersedesPolicyId: policy.supersedesPolicyId, createdAt: policy.createdAt,
  }),
  getDecisionPolicy: async (merchantId, bindings) => {
    const result = await adminClient(bindings).query((api as any).growth.adminGetActiveDecisionPolicy, {
      serviceSecret: serviceSecret(bindings), merchantId,
    }) as null | { policyJson: string };
    return result ? DecisionPolicySchema.parse(JSON.parse(result.policyJson)) : null;
  },
};

function adminAuthorized(authorization: string | undefined, bindings?: Bindings): boolean {
  const expected = bindings?.PROOFGATE_SERVICE_SECRET;
  const actual = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!expected || actual.length !== expected.length) return false;
  let different = 0;
  for (let index = 0; index < expected.length; index += 1) different |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return different === 0;
}

async function tenantFromHermesHeader(value: string | undefined) {
  if (!value) return null;
  try { return await deriveTenantIdentity(value); } catch { return null; }
}

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function encryptSensitive(value: string, encodedKey: string | undefined): Promise<string> {
  if (!encodedKey) throw new Error("PROOFGATE_DATA_KEY is not configured");
  const rawKey = decodeBase64(encodedKey);
  if (rawKey.byteLength !== 32) throw new Error("PROOFGATE_DATA_KEY must contain exactly 32 bytes");
  const key = await crypto.subtle.importKey("raw", new Uint8Array(Array.from(rawKey)).buffer, "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value)));
  return `aesgcm:v1:${encodeBase64(iv)}:${encodeBase64(ciphertext)}`;
}

async function decryptSensitive(value: string, encodedKey: string | undefined): Promise<string> {
  if (!encodedKey) throw new Error("PROOFGATE_DATA_KEY is not configured");
  const [prefix, version, encodedIv, encodedCiphertext] = value.split(":");
  if (prefix !== "aesgcm" || version !== "v1" || !encodedIv || !encodedCiphertext) throw new Error("unsupported encrypted value");
  const rawKey = decodeBase64(encodedKey);
  if (rawKey.byteLength !== 32) throw new Error("PROOFGATE_DATA_KEY must contain exactly 32 bytes");
  const key = await crypto.subtle.importKey("raw", new Uint8Array(Array.from(rawKey)).buffer, "AES-GCM", false, ["decrypt"]);
  const iv = new Uint8Array(Array.from(decodeBase64(encodedIv))).buffer;
  const ciphertext = new Uint8Array(Array.from(decodeBase64(encodedCiphertext))).buffer;
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

export function createApp(evidenceBoundary: EvidenceBoundary = liveEvidenceBoundary, growthBoundary: GrowthBoundary = liveGrowthBoundary, adminBoundary: GrowthAdminBoundary = liveAdminBoundary): Hono<{ Bindings: Bindings }> {
  const app = new Hono<{ Bindings: Bindings }>();
  app.get("/", (context) => context.html(renderProductHome(), 200, {
    "cache-control": "no-store",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  }));
  const legalHeaders = {
    "cache-control": "public, max-age=3600",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  } as const;
  app.get("/privacy", (context) => context.html(renderPrivacyPolicy(), 200, legalHeaders));
  app.get("/data-deletion", (context) => context.html(renderDataDeletion(), 200, legalHeaders));
  app.get("/terms", (context) => context.html(renderTermsOfService(), 200, legalHeaders));
  app.get("/health", (context) => context.json({ service: "proofgate-edge", phase: "whatsapp-growth-p0", status: "ok" }));
  app.get("/s/:slug", async (context) => {
    const slug = context.req.param("slug");
    const growthSite = await growthBoundary.getPublishedSite(slug, context.env);
    if (growthSite) {
      const sessionId = sessionIdFromCookie(context.req.header("cookie")) ?? crypto.randomUUID();
      await growthBoundary.appendEvent({
        eventId: crypto.randomUUID(), type: "page_view", siteId: slug, versionId: growthSite.versionId,
        specHash: growthSite.specHash, sessionHash: await sha256(sessionId), occurredAt: Date.now(),
      }, context.env);
      return context.html(renderBusinessSite(growthSite.spec, growthSite), 200, {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'",
        "referrer-policy": "strict-origin-when-cross-origin",
        "x-content-type-options": "nosniff",
        "x-proofgate-spec-hash": growthSite.specHash,
        "x-proofgate-version-id": growthSite.versionId,
        "set-cookie": `pgsid=${sessionId}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`,
      });
    }
    if (slug !== initialSpikeSiteSpec.siteId) return context.notFound();
    const spec = SiteSpecSchema.parse(initialSpikeSiteSpec);
    const specHash = await sha256(canonicalize(spec));
    return context.html(renderSite(spec), 200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-proofgate-spec-hash": specHash,
      "x-proofgate-version-id": "spike-a-v1",
    });
  });
  app.get("/r/whatsapp/:siteId/:itemId", async (context) => {
    const site = await growthBoundary.getPublishedSite(context.req.param("siteId"), context.env);
    if (!site) return context.notFound();
    const itemId = context.req.param("itemId");
    const item = site.spec.catalog.find((candidate) => candidate.id === itemId);
    if (itemId !== "general" && (!item || !item.available)) return context.notFound();
    const sessionId = sessionIdFromCookie(context.req.header("cookie")) ?? crypto.randomUUID();
    await growthBoundary.appendEvent({
      eventId: crypto.randomUUID(), type: "whatsapp_cta_click", siteId: site.spec.siteId, versionId: site.versionId,
      specHash: site.specHash, sessionHash: await sha256(sessionId), itemId,
      source: cleanDimension(context.req.query("source")), campaign: cleanDimension(context.req.query("campaign")), occurredAt: Date.now(),
    }, context.env);
    const number = site.spec.business.orderWhatsAppNumber.replace(/\D/g, "");
    const message = item?.whatsappMessage ?? site.spec.whatsappCta.defaultMessage;
    const encodedMessage = encodeURIComponent(message).replace(/'/g, "%27");
    return context.redirect(`https://wa.me/${number}?text=${encodedMessage}`, 302);
  });
  app.get("/assets/:assetId", async (context) => {
    const assetId = context.req.param("assetId");
    if (!/^[a-zA-Z0-9_-]{3,128}$/.test(assetId)) return context.notFound();
    const asset = await growthBoundary.getAsset(assetId, context.env);
    if (!asset) return context.notFound();
    return new Response(asset.body as BodyInit, { headers: { "content-type": asset.contentType, etag: asset.etag, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff" } });
  });
  app.get("/whatsapp/webhook", (context) => {
    const mode = context.req.query("hub.mode");
    const token = context.req.query("hub.verify_token");
    const challenge = context.req.query("hub.challenge");
    if (mode !== "subscribe" || !challenge || token !== context.env?.META_VERIFY_TOKEN) return context.text("Forbidden", 403);
    return context.text(challenge, 200);
  });
  app.post("/whatsapp/webhook", async (context) => {
    const rawBody = new Uint8Array(await context.req.arrayBuffer());
    const body = new TextDecoder().decode(rawBody);
    if (!context.env?.META_APP_SECRET || !await verifyMetaWebhookSignature(body, context.req.header("x-hub-signature-256"), context.env.META_APP_SECRET)) {
      return context.text("Invalid Meta signature", 401);
    }
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { return context.text("Invalid JSON", 400); }
    const approval = extractProofGateApproval(payload);
    if (approval) {
      const result = await growthBoundary.resolveApproval(approval, context.env);
      return context.json(result, result.accepted ? 200 : 409);
    }
    return growthBoundary.forwardToHermes(rawBody, context.req.raw.headers, context.env);
  });
  app.post("/webhooks/vapi", async (context) => {
    const body = await context.req.text();
    const authenticated = context.env?.VAPI_WEBHOOK_SECRET && await authenticateVapiWebhook(body, {
      timestamp: context.req.header("x-vapi-timestamp"), signature: context.req.header("x-vapi-signature"),
    }, context.env.VAPI_WEBHOOK_SECRET);
    if (!authenticated) return context.text("Invalid Vapi signature", 401);
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { return context.text("Invalid JSON", 400); }
    return context.json(await growthBoundary.ingestVapiReport(payload, context.env), 200);
  });
  app.post("/verification/:token", async (context) => {
    const token = context.req.param("token");
    if (!/^pgv_[a-zA-Z0-9_-]{20,128}$/.test(token)) return context.text("Invalid verification capability", 400);
    const payload = await context.req.json() as { evidenceId?: string; siteId?: string; versionId?: string; specHash?: string; runId?: string; passed?: boolean; blockers?: unknown; observedAt?: number; report?: unknown };
    if (!payload.evidenceId || !payload.siteId || !payload.versionId || !payload.specHash || !payload.runId || typeof payload.passed !== "boolean" || !Array.isArray(payload.blockers) || payload.blockers.some((item) => typeof item !== "string") || !Number.isFinite(payload.observedAt)) return context.text("Invalid verification evidence", 400);
    const result = await growthBoundary.submitVerification({
      tokenHash: await sha256(token), evidenceId: payload.evidenceId, siteId: payload.siteId, versionId: payload.versionId,
      specHash: payload.specHash, runId: payload.runId, reportHash: await sha256(canonicalize(payload.report)),
      passed: payload.passed, blockers: payload.blockers.slice(0, 50) as string[], observedAt: payload.observedAt!,
    }, context.env);
    return context.json(result, result.accepted ? 201 : 409);
  });
  app.post("/internal/intake", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const hermesUserId = context.req.header("x-hermes-user-id");
    if (!hermesUserId) return context.text("Authenticated WhatsApp sender is required", 400);
    let identity;
    try { identity = await deriveTenantIdentity(hermesUserId); } catch { return context.text("Invalid WhatsApp sender identity", 400); }
    const submitted = await context.req.json() as Record<string, unknown>;
    if ((submitted.merchantId && submitted.merchantId !== identity.merchantId) || (submitted.ownerWaIdHash && submitted.ownerWaIdHash !== identity.ownerWaIdHash)) {
      return context.text("Hermes owner identity mismatch", 403);
    }
    const { merchantId: _merchantId, ownerWaIdHash: _ownerWaIdHash, ...merchantInput } = submitted;
    const brief = BusinessBriefSchema.parse({ ...BusinessBriefInputSchema.parse(merchantInput), ...identity });
    const result = await adminBoundary.upsertMerchant(brief, await encryptSensitive(brief.orderWhatsAppNumber, context.env?.PROOFGATE_DATA_KEY), context.env);
    return context.json({ accepted: true, merchantId: brief.merchantId, result }, 201);
  });
  app.post("/internal/policy", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const policy = DecisionPolicySchema.parse(await context.req.json());
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (tenant.ownerWaIdHash !== policy.ownerWaIdHash || tenant.merchantId !== policy.merchantId) return context.text("Hermes owner identity mismatch", 403);
    const policyHash = await sha256(canonicalize(policy));
    const result = await adminBoundary.saveDecisionPolicy({ policy, policyHash }, context.env);
    return context.json({ accepted: true, policyId: policy.policyId, policyHash, result }, 201);
  });
  app.post("/internal/decision", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const request = DecisionRequestSchema.parse(await context.req.json());
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (tenant.merchantId !== request.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const policy = await adminBoundary.getDecisionPolicy(request.merchantId, context.env);
    if (!policy) return context.json({ decision: "require_policy", reason: "merchant_policy_not_configured" }, 409);
    return context.json(evaluateDecision(policy, request), 200);
  });
  app.post("/internal/candidate", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { spec?: unknown; versionId?: string; parentVersionId?: string };
    const spec = SiteSpecV2Schema.parse(payload.spec);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (tenant.merchantId !== spec.business.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    if (!payload.versionId || !/^[a-zA-Z0-9_-]{3,128}$/.test(payload.versionId)) return context.text("Invalid version ID", 400);
    const specHash = await sha256(canonicalize(spec));
    const result = await adminBoundary.createCandidate({ spec, versionId: payload.versionId, parentVersionId: payload.parentVersionId, specHash, actor: `hermes:${tenant.ownerWaIdHash}` }, context.env);
    return context.json({ accepted: true, specHash, result }, 201);
  });
  app.post("/internal/verification-capability", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { siteId?: string; merchantId?: string; versionId?: string; specHash?: string };
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (!payload.siteId || !payload.versionId || !/^[a-f0-9]{64}$/.test(payload.specHash ?? "")) return context.text("Invalid candidate scope", 400);
    if (payload.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const token = `pgv_${crypto.randomUUID().replace(/-/g, "")}`;
    const expiresAt = Date.now() + 30 * 60_000;
    await adminBoundary.mintVerification({ tokenHash: await sha256(token), merchantId: tenant.merchantId, siteId: payload.siteId, versionId: payload.versionId, specHash: payload.specHash!, expiresAt }, context.env);
    return context.json({ token, expiresAt, evidenceUrl: `/verification/${token}` }, 201);
  });
  app.post("/internal/release", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { siteId?: string; merchantId?: string; versionId?: string; specHash?: string };
    if (!payload.siteId || !payload.merchantId || !payload.versionId || !/^[a-f0-9]{64}$/.test(payload.specHash ?? "")) return context.text("Invalid release scope", 400);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (payload.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const scopeHash = await sha256(canonicalize({ siteId: payload.siteId, versionId: payload.versionId, specHash: payload.specHash }));
    const approvalId = `approval-${crypto.randomUUID()}`;
    const requestId = `release-${crypto.randomUUID()}`;
    await adminBoundary.createReleaseRequest({ requestId, siteId: payload.siteId, merchantId: payload.merchantId, versionId: payload.versionId, specHash: payload.specHash!, scopeHash, approvalId }, context.env);
    await adminBoundary.createApproval({ approvalId, merchantId: payload.merchantId, type: "release", scopeHash, expiresAt: Date.now() + 86_400_000 }, context.env);
    const recipientWaId = context.req.header("x-hermes-user-id")?.replace(/\D/g, "");
    if (!recipientWaId || !context.env?.META_PHONE_NUMBER_ID || !context.env.META_ACCESS_TOKEN) return context.json({ accepted: true, requestId, approvalId, scopeHash, delivery: "blocked_missing_meta_configuration" }, 202);
    const receipt = await sendApprovalButtons({ graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID, accessToken: context.env.META_ACCESS_TOKEN, recipientWaId, approvalId, body: `Publish verified bakery version ${payload.versionId}?` });
    await adminBoundary.attachApprovalMessage(approvalId, receipt.providerMessageId, context.env);
    return context.json({ accepted: true, requestId, approvalId, scopeHash, providerMessageId: receipt.providerMessageId }, 201);
  });
  app.post("/internal/lead", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { merchantId?: string; consent?: unknown };
    if (!payload.merchantId) return context.text("merchantId is required", 400);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (payload.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const consent = LeadConsentSchema.parse(payload.consent);
    return context.json({ accepted: true, result: await adminBoundary.registerLead(payload.merchantId, consent, context.env) }, 201);
  });
  app.post("/internal/call-batch", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const submitted = await context.req.json() as CallBatch;
    const { scopeHash: submittedScopeHash, ...batchInput } = submitted;
    const batch = await createCallBatch(batchInput);
    if (submittedScopeHash !== batch.scopeHash) return context.text("Call batch scope hash mismatch", 409);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (batch.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const approvalId = `approval-${crypto.randomUUID()}`;
    await adminBoundary.createCallBatch(batch, approvalId, context.env);
    await adminBoundary.createApproval({ approvalId, merchantId: batch.merchantId, type: "call_batch", scopeHash: batch.scopeHash, expiresAt: Date.now() + 86_400_000 }, context.env);
    const recipientWaId = context.req.header("x-hermes-user-id")?.replace(/\D/g, "");
    if (!recipientWaId || !context.env?.META_PHONE_NUMBER_ID || !context.env?.META_ACCESS_TOKEN) return context.json({ accepted: true, approvalId, delivery: "blocked_missing_meta_configuration" }, 202);
    const receipt = await sendApprovalButtons({ graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID, accessToken: context.env.META_ACCESS_TOKEN, recipientWaId, approvalId, body: `Approve ${batch.leadIds.length} consented qualification call${batch.leadIds.length === 1 ? "" : "s"}? Budget cap: $${batch.costCapUsd.toFixed(2)}. One attempt per lead.` });
    await adminBoundary.attachApprovalMessage(approvalId, receipt.providerMessageId, context.env);
    return context.json({ accepted: true, approvalId, providerMessageId: receipt.providerMessageId }, 201);
  });
  app.post("/internal/reel", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const plan = ReelPlanSchema.parse(await context.req.json());
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (plan.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const planHash = await sha256(canonicalize(plan));
    const approvalId = `approval-${crypto.randomUUID()}`;
    await adminBoundary.registerReel(plan, planHash, approvalId, context.env);
    await adminBoundary.createApproval({ approvalId, merchantId: plan.merchantId, type: "reel", scopeHash: planHash, expiresAt: Date.now() + 86_400_000 }, context.env);
    const recipientWaId = context.req.header("x-hermes-user-id")?.replace(/\D/g, "");
    if (!recipientWaId || !context.env?.META_PHONE_NUMBER_ID || !context.env?.META_ACCESS_TOKEN) return context.json({ accepted: true, approvalId, planHash, delivery: "blocked_missing_meta_configuration" }, 202);
    const receipt = await sendApprovalButtons({ graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID, accessToken: context.env.META_ACCESS_TOKEN, recipientWaId, approvalId, body: `Render reel angle: ${plan.angle}` });
    await adminBoundary.attachApprovalMessage(approvalId, receipt.providerMessageId, context.env);
    return context.json({ accepted: true, approvalId, planHash, providerMessageId: receipt.providerMessageId }, 201);
  });
  app.post("/internal/social-campaign", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const submitted = await context.req.json() as SocialCampaign;
    const { scopeHash: submittedScopeHash, ...campaignInput } = submitted;
    const campaign = await createSocialCampaign(campaignInput);
    if (submittedScopeHash !== campaign.scopeHash) return context.text("Social campaign scope hash mismatch", 409);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (campaign.merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const approvalId = `approval-${crypto.randomUUID()}`;
    await adminBoundary.registerSocialCampaign({ campaign, approvalId }, context.env);
    await adminBoundary.createApproval({
      approvalId, merchantId: campaign.merchantId, type: "social_campaign", scopeHash: campaign.scopeHash,
      expiresAt: Date.now() + 86_400_000,
    }, context.env);
    const recipientWaId = context.req.header("x-hermes-user-id")?.replace(/\D/g, "");
    if (!recipientWaId || !context.env?.META_PHONE_NUMBER_ID || !context.env.META_ACCESS_TOKEN) {
      return context.json({ accepted: true, approvalId, scopeHash: campaign.scopeHash, delivery: "blocked_missing_meta_configuration" }, 202);
    }
    const receipt = await sendApprovalButtons({
      graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID,
      accessToken: context.env.META_ACCESS_TOKEN, recipientWaId, approvalId,
      body: "Approve this exact Instagram experiment: three scheduled reel variations, one approval, no extra posts?",
    });
    await adminBoundary.attachApprovalMessage(approvalId, receipt.providerMessageId, context.env);
    return context.json({ accepted: true, approvalId, scopeHash: campaign.scopeHash, providerMessageId: receipt.providerMessageId }, 201);
  });
  app.put("/internal/assets/:assetId", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const localAssetId = context.req.param("assetId");
    const merchantId = context.req.header("x-proofgate-merchant-id");
    const sourceProviderMessageId = context.req.header("x-proofgate-source-message-id");
    const contentType = context.req.header("content-type") ?? "application/octet-stream";
    if (!/^[a-zA-Z0-9_-]{3,100}$/.test(localAssetId) || !merchantId || !sourceProviderMessageId) return context.text("Invalid asset metadata", 400);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    if (merchantId !== tenant.merchantId) return context.text("Hermes tenant identity mismatch", 403);
    const assetId = tenantScopedAssetId(tenant, localAssetId);
    if (!/^image\/(jpeg|png|webp)$/.test(contentType) && contentType !== "video/mp4" && !/^audio\/(mpeg|ogg)$/.test(contentType)) return context.text("Unsupported asset type", 415);
    const body = new Uint8Array(await context.req.arrayBuffer());
    if (body.byteLength === 0 || body.byteLength > MAX_ASSET_BYTES) return context.text("Asset size is invalid", 413);
    if (!hasValidAssetSignature(contentType, body)) return context.text("Asset content does not match its declared type", 415);
    const digest = await sha256Bytes(body);
    if (!context.env?.PROOFGATE_ASSETS) {
      const result = await adminBoundary.uploadAsset({ assetId, merchantId, sha256: digest, contentType, byteLength: body.byteLength, sourceProviderMessageId, body }, context.env);
      return context.json({ accepted: true, localAssetId, assetId, sha256: digest, storageBackend: "convex", result }, 201);
    }
    const objectKey = `assets/${tenant.merchantId}/${assetId}/${digest}`;
    await context.env.PROOFGATE_ASSETS.put(objectKey, body, { httpMetadata: { contentType }, customMetadata: { sha256: digest, merchantId } });
    const result = await adminBoundary.registerAsset({ assetId, merchantId, storageBackend: "r2", objectKey, sha256: digest, contentType, byteLength: body.byteLength, sourceProviderMessageId }, context.env);
    return context.json({ accepted: true, localAssetId, assetId, sha256: digest, storageBackend: "r2", result }, 201);
  });
  app.post("/internal/guardian", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json().catch(() => ({})) as { kind?: string };
    if (payload.kind === "reel") {
      const job = await adminBoundary.claimReel(context.env);
      return context.json({ claimed: Boolean(job), job });
    }
    if (payload.kind === "release") return context.json(await adminBoundary.promoteRelease(context.env));
    if (payload.kind !== "calls") return context.text("kind must be calls, reel, or release", 400);
    if (!context.env?.VAPI_API_KEY || !context.env.VAPI_PHONE_NUMBER_ID || !context.env.VAPI_SQUAD_ID || !context.env.PROOFGATE_DATA_KEY) {
      return context.json({ claimed: false, blocked: "missing_vapi_or_data_key_configuration" }, 503);
    }
    const job = await adminBoundary.claimCallBatch(context.env);
    if (!job) return context.json({ claimed: false });
    try {
      const leads = await Promise.all(job.leads.map(async (lead) => ({ leadId: lead.leadId, number: await decryptSensitive(lead.phoneCiphertext, context.env.PROOFGATE_DATA_KEY) })));
      const calls = await createQualificationCalls({
        apiKey: context.env.VAPI_API_KEY,
        phoneNumberId: context.env.VAPI_PHONE_NUMBER_ID,
        squadId: context.env.VAPI_SQUAD_ID,
        batchId: job.batchId,
        earliestAt: new Date(job.earliestAt).toISOString(),
        leads,
      });
      return context.json({ claimed: true, batchId: job.batchId, calls }, 201);
    } catch (error) {
      return context.json({ claimed: true, batchId: job.batchId, dispatched: false, error: error instanceof Error ? error.message : "provider failure" }, 502);
    }
  });
  app.post("/internal/reel-result", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { reelId?: string; status?: string; renderedAssetId?: string };
    if (!payload.reelId || (payload.status !== "rendered" && payload.status !== "failed")) return context.text("Invalid reel result", 400);
    if (payload.status === "rendered" && !payload.renderedAssetId) return context.text("renderedAssetId is required", 400);
    return context.json(await adminBoundary.completeReel(payload.reelId, payload.status, payload.renderedAssetId, undefined, context.env));
  });
  app.post("/internal/reel-delivery", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { reelId?: string; renderedAssetId?: string; recipientWaId?: string; caption?: string };
    if (!payload.reelId || !/^[a-zA-Z0-9_-]{3,128}$/.test(payload.reelId) || !payload.renderedAssetId || !/^[a-zA-Z0-9_-]{3,128}$/.test(payload.renderedAssetId)) return context.text("Invalid reel delivery scope", 400);
    if (!payload.recipientWaId || !/^\d{8,15}$/.test(payload.recipientWaId) || (payload.caption?.length ?? 0) > 1024) return context.text("Invalid reel recipient or caption", 400);
    if (!context.env?.META_PHONE_NUMBER_ID || !context.env.META_ACCESS_TOKEN) return context.text("Meta is not configured", 503);
    const object = await adminBoundary.getPrivateAsset(payload.renderedAssetId, context.env);
    if (!object) return context.text("Rendered reel asset not found", 404);
    const contentType = object.contentType;
    if (contentType !== "video/mp4") return context.text("Rendered asset is not an MP4", 409);
    const media = await uploadMetaMedia({
      graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID,
      accessToken: context.env.META_ACCESS_TOKEN, bytes: object.body, contentType, filename: `${payload.reelId}.mp4`,
    });
    const receipt = await sendVideoByMediaId({
      graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID,
      accessToken: context.env.META_ACCESS_TOKEN, recipientWaId: payload.recipientWaId, mediaId: media.mediaId, caption: payload.caption,
    });
    await adminBoundary.completeReel(payload.reelId, "rendered", payload.renderedAssetId, receipt.providerMessageId, context.env);
    return context.json({ delivered: true, reelId: payload.reelId, renderedAssetId: payload.renderedAssetId, providerMessageId: receipt.providerMessageId }, 201);
  });
  app.post("/internal/action-required", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const payload = await context.req.json() as { recipientWaId?: string };
    if (!payload.recipientWaId || !/^\d{8,15}$/.test(payload.recipientWaId)) return context.text("Invalid recipient", 400);
    if (!context.env?.META_PHONE_NUMBER_ID || !context.env.META_ACCESS_TOKEN || !context.env.META_ACTION_REQUIRED_TEMPLATE) return context.text("Meta template is not configured", 503);
    return context.json(await sendActionRequiredTemplate({ graphApiVersion: context.env.META_GRAPH_API_VERSION ?? "v20.0", phoneNumberId: context.env.META_PHONE_NUMBER_ID, accessToken: context.env.META_ACCESS_TOKEN, recipientWaId: payload.recipientWaId, templateName: context.env.META_ACTION_REQUIRED_TEMPLATE }), 201);
  });
  app.get("/internal/metrics/:siteId", async (context) => {
    if (!adminAuthorized(context.req.header("authorization"), context.env)) return context.text("Unauthorized", 401);
    const tenant = await tenantFromHermesHeader(context.req.header("x-hermes-user-id"));
    if (!tenant) return context.text("Authenticated WhatsApp sender is required", 400);
    const since = Number(context.req.query("since"));
    if (!Number.isFinite(since) || since < 0) return context.text("Invalid since value", 400);
    return context.json(await adminBoundary.metrics(context.req.param("siteId"), tenant.merchantId, since, context.env));
  });
  app.get("/ack", (context) => {
    const token = context.req.query("token");
    if (!token) return context.text("Missing acknowledgment capability", 400);
    return context.html(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Booking acknowledgment</title></head><body><main><h1>Saturday Sessions booking</h1><p>Please confirm that you received the request for exactly two seats.</p><form method="post" action="/ack" data-pg="ack-form"><input type="hidden" name="token" value="${token.replace(/[&<>"']/g, "")}"><button type="submit" data-pg="ack-button">Acknowledge two-seat booking</button></form></main></body></html>`, 200, {
      "cache-control": "no-store",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
      "referrer-policy": "no-referrer",
    });
  });
  app.post("/ack", async (context) => {
    const body = await context.req.parseBody();
    const token = typeof body.token === "string" ? body.token : "";
    if (!token) return context.text("Missing acknowledgment capability", 400);
    try {
      const result = await evidenceBoundary.acknowledge(token, context.env?.CONVEX_URL);
      return context.html(`<!doctype html><html><head><meta name="viewport" content="width=device-width"><title>Acknowledged</title></head><body><main data-pg="ack-confirmation"><h1>Acknowledgment recorded</h1><p>Passport state: ${result.passportState}</p></main></body></html>`, 200, {
        "cache-control": "no-store",
        "content-security-policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'",
        "referrer-policy": "no-referrer",
      });
    } catch {
      return context.text("The acknowledgment capability is invalid or expired", 403);
    }
  });
  app.get("/proof/:slug", async (context) => {
    const site = await growthBoundary.getPublishedSite(context.req.param("slug"), context.env);
    if (site) return context.json({ site: context.req.param("slug"), versionId: site.versionId, specHash: site.specHash, state: site.passportState, statement: "State is derived from the exact published version and its release predicates." });
    return context.json({ site: context.req.param("slug"), state: "gray", statement: "Development spike only. No external witness or production certification exists." });
  });
  return app;
}

export default createApp();
