import { describe, expect, it, vi } from "vitest";

import { createApp, type GrowthAdminBoundary, type GrowthBoundary, type StudioVerifierBoundary } from "../../apps/edge-runtime/src/index";
import { initialBakerySiteSpec } from "../../packages/domain/src/growth";
import { deriveTenantIdentity, tenantScopedAssetId } from "../../packages/domain/src/tenant";
import { metaSignatureForTest } from "../../packages/whatsapp-io/src/meta-webhook";

function boundary(): GrowthBoundary & { events: Array<Record<string, unknown>> } {
  const events: Array<Record<string, unknown>> = [];
  return {
    events,
    getPublishedSite: async (slug) => slug === "mayas-oven" ? { spec: initialBakerySiteSpec, versionId: "bakery-v1", specHash: "a".repeat(64), passportState: "green" } : null,
    appendEvent: async (event) => { events.push(event); },
    resolveApproval: vi.fn(async () => ({ accepted: true })),
    ingestVapiReport: vi.fn(async () => ({ accepted: true })),
    forwardToHermes: vi.fn(async () => new Response("forwarded", { status: 202 })),
    getAsset: async (assetId) => assetId === "cake-1" ? { body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg", etag: "asset-etag" } : null,
    submitVerification: vi.fn(async () => ({ accepted: true })),
  };
}

function adminBoundary(): GrowthAdminBoundary {
  return {
    upsertMerchant: vi.fn(async () => ({ inserted: true })),
    createCandidate: vi.fn(async () => ({ inserted: true })),
    getPreviewSite: vi.fn(async (siteId: string, versionId: string, specHash: string) => siteId === "mayas-oven" && versionId === "bakery-v1"
      ? { spec: initialBakerySiteSpec, versionId, specHash }
      : null),
    registerLead: vi.fn(async () => ({ inserted: true })),
    createApproval: vi.fn(async () => ({ inserted: true })),
    resolveStudioApproval: vi.fn(async () => ({ accepted: true })),
    attachApprovalMessage: vi.fn(async () => ({ attached: true })),
    createCallBatch: vi.fn(async () => ({ inserted: true })),
    registerReel: vi.fn(async () => ({ inserted: true })),
    registerAsset: vi.fn(async () => ({ inserted: true })),
    uploadAsset: vi.fn(async () => ({ inserted: true, storageBackend: "convex" as const })),
    getPrivateAsset: vi.fn(async (assetId: string) => assetId === "reel-output-1"
      ? { body: new Uint8Array([1, 2, 3]), contentType: "video/mp4", etag: "convex-etag" }
      : assetId === "cake-1"
        ? { body: new Uint8Array([0xff, 0xd8, 0xff]), contentType: "image/jpeg", etag: "preview-etag" }
        : null),
    metrics: vi.fn(async () => ({ views: 10, clicks: 2, clickThroughRate: 0.2 })),
    claimCallBatch: vi.fn(async () => null),
    claimReel: vi.fn(async () => null),
    completeReel: vi.fn(async () => ({ completed: true })),
    mintVerification: vi.fn(async () => ({ created: true })),
    createReleaseRequest: vi.fn(async () => ({ verificationRunId: "verify-1" })),
    promoteRelease: vi.fn(async () => ({ promoted: false })),
    saveDecisionPolicy: vi.fn(async () => ({ inserted: true })),
    getDecisionPolicy: vi.fn(async () => null),
    registerSocialCampaign: vi.fn(async () => ({ inserted: true })),
    createStudioLink: vi.fn(async () => ({ created: true })),
    claimStudioLink: vi.fn(async () => ({ linked: true })),
    completeStudioLink: vi.fn(async () => ({ status: "pending" as const })),
    getStudioSession: vi.fn(async () => null),
    saveStudioProject: vi.fn(async () => ({ inserted: true })),
    listStudioProjects: vi.fn(async () => []),
  };
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

describe("growth Worker", () => {
  it("serves a guided Product Hunt studio for website, reels, or both", async () => {
    const response = await createApp(undefined, boundary(), adminBoundary()).request("http://proofgate.test/studio");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("script-src 'self'");
    const html = await response.text();
    expect(html).toContain('data-pg="studio"');
    expect(html).toContain("Build a website");
    expect(html).toContain("Create reels");
    expect(html).toContain("I need both");
    expect(html).toContain("Continue with WhatsApp");
    expect(html).toContain("Order WhatsApp number");
    expect(html).toContain("What do you offer?");
    expect(html).toContain("Build checked preview");
    expect(html).toContain('data-pg="publish-checklist"');
    expect(html).not.toContain("API key");
  });

  it("wires Studio uploads into a saved revision, checked preview, and one publish action", async () => {
    const response = await createApp(undefined, boundary(), adminBoundary()).request("http://proofgate.test/studio.js");
    const javascript = await response.text();
    expect(javascript).toContain("referenceAssetIds:assetIds");
    expect(javascript).toContain("/build");
    expect(javascript).toContain("/api/studio/approvals/");
    expect(javascript).toContain("needs_input");
  });

  it("creates a short-lived WhatsApp credential link without exposing a secret", async () => {
    const admin = adminBoundary();
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/api/studio/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "both" }),
    }, { AXCAS_WHATSAPP_NUMBER: "15556537153" } as never);
    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain("axcas_link=");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    const body = await response.json() as Record<string, unknown>;
    expect(body.whatsappUrl).toMatch(/^https:\/\/wa\.me\/15556537153\?text=AXCAS%20LINK%20[A-Z0-9]+$/);
    expect(body).not.toHaveProperty("browserNonce");
    expect(admin.createStudioLink).toHaveBeenCalledWith(expect.objectContaining({
      linkId: expect.stringMatching(/^link-/),
      codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      browserNonceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      intent: "both",
    }), expect.anything());
  });

  it("rate-limits repeated public Studio link creation using only a short-lived hashed network key", async () => {
    const values = new Map<string, string>();
    const keys: string[] = [];
    const kv = {
      get: vi.fn(async (key: string) => values.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => { keys.push(key); values.set(key, value); }),
    };
    const app = createApp(undefined, boundary(), adminBoundary());
    for (let index = 0; index < 5; index += 1) {
      const allowed = await app.request("http://proofgate.test/api/studio/link", {
        method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.44" }, body: JSON.stringify({ intent: "website" }),
      }, { PROOFGATE_CONFIG: kv, PROOFGATE_SERVICE_SECRET: "service-secret" } as never);
      expect(allowed.status).toBe(201);
    }
    const limited = await app.request("http://proofgate.test/api/studio/link", {
      method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.44" }, body: JSON.stringify({ intent: "website" }),
    }, { PROOFGATE_CONFIG: kv, PROOFGATE_SERVICE_SECRET: "service-secret" } as never);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toMatch(/^\d+$/);
    expect(keys.every((key) => !key.includes("203.0.113.44"))).toBe(true);
  });

  it("binds a signed WhatsApp link message to the authenticated sender", async () => {
    const admin = adminBoundary();
    const secret = "meta-secret";
    const raw = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "919876543210", id: "wamid.link", type: "text", text: { body: "AXCAS LINK K7M2Q9" } }] } }] }] });
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": await metaSignatureForTest(raw, secret) },
      body: raw,
    }, { META_APP_SECRET: secret, META_VERIFY_TOKEN: "verify" });
    expect(response.status).toBe(200);
    expect(admin.claimStudioLink).toHaveBeenCalledWith(expect.objectContaining({
      codeHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      merchantId: expect.stringMatching(/^merchant-/),
      ownerWaIdHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      providerMessageId: "wamid.link",
    }), expect.anything());
  });

  it("exchanges a browser-bound WhatsApp claim for an HttpOnly studio session", async () => {
    const admin = adminBoundary();
    (admin.completeStudioLink as ReturnType<typeof vi.fn>).mockResolvedValue({ status: "authenticated", intent: "both", merchantId: "merchant-maya", ownerWaIdHash: "a".repeat(64) });
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/api/studio/link/status", {
      method: "POST",
      headers: { cookie: "axcas_link=link-123e4567-e89b-12d3-a456-426614174000.ABCDEFGHIJKLMNOPQRSTUVWX" },
    }, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toMatch(/^axcas_session=[A-Za-z0-9_-]+;/);
    expect(response.headers.get("set-cookie")).toContain("Secure; HttpOnly; SameSite=Lax");
    expect(admin.completeStudioLink).toHaveBeenCalledWith(expect.objectContaining({
      linkId: "link-123e4567-e89b-12d3-a456-426614174000",
      browserNonceHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      sessionHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }), expect.anything());
  });

  it("stores a web project revision only for an authenticated linked merchant", async () => {
    const admin = adminBoundary();
    (admin.getStudioSession as ReturnType<typeof vi.fn>).mockResolvedValue({ merchantId: "merchant-maya", ownerWaIdHash: "a".repeat(64), expiresAt: Date.now() + 10_000 });
    const app = createApp(undefined, boundary(), admin);
    const unauthorized = await app.request("http://proofgate.test/api/studio/projects", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: "website", businessName: "Maya Studio", description: "Tailoring", siteStyle: "minimal", referenceAssetIds: [] }),
    });
    expect(unauthorized.status).toBe(401);

    const saved = await app.request("http://proofgate.test/api/studio/projects", {
      method: "POST", headers: { "content-type": "application/json", cookie: "axcas_session=abcdefghijklmnopqrstuvwxyz1234567890" },
      body: JSON.stringify({ intent: "website", businessName: "Maya Studio", description: "Custom tailoring in Bengaluru", siteStyle: "minimal", referenceAssetIds: [] }),
    });
    expect(saved.status).toBe(201);
    expect(admin.saveStudioProject).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: "merchant-maya", intent: "website", projectId: expect.stringMatching(/^project-/), revisionId: expect.stringMatching(/^revision-/),
      project: expect.objectContaining({ businessName: "Maya Studio", siteStyle: "minimal" }),
    }), undefined);
  });

  it("turns one complete Studio project into a verified candidate and one publish checklist", async () => {
    const admin = adminBoundary();
    (admin.getStudioSession as ReturnType<typeof vi.fn>).mockResolvedValue({ merchantId: "merchant-1234567890abcdef", ownerWaIdHash: "a".repeat(64), expiresAt: Date.now() + 10_000 });
    (admin.listStudioProjects as ReturnType<typeof vi.fn>).mockResolvedValue([{
      projectId: "project-tailor-1", revisionId: "revision-tailor-1", intent: "website", createdAt: Date.now(),
      project: {
        projectId: "project-tailor-1", intent: "website", businessName: "Maya Studio",
        description: "Custom blouse stitching and alterations in Bengaluru", siteStyle: "portfolio",
        referenceAssetIds: ["merchant-asset-front"], orderWhatsAppNumber: "+919876543210",
        fulfillmentArea: "Bengaluru", leadTime: "Ready in 5–7 days", timezone: "Asia/Kolkata",
        offerings: [{ name: "Custom blouse", description: "Made to your measurements", priceMinor: 150000, currency: "INR" }],
        suppliedClaims: ["Custom stitching"],
      },
    }]);
    const verifier: StudioVerifierBoundary = {
      run: vi.fn(async () => ({ accepted: true, passed: true, blockers: [], runId: "studio-verify-1" })),
    };
    const response = await createApp(undefined, boundary(), admin, verifier).request("http://proofgate.test/api/studio/projects/project-tailor-1/build", {
      method: "POST", headers: { cookie: "axcas_session=abcdefghijklmnopqrstuvwxyz1234567890" },
    }, {
      PROOFGATE_SERVICE_SECRET: "service-secret",
      PROOFGATE_DATA_KEY: Buffer.alloc(32, 7).toString("base64"),
      SITE_VERIFIER_URL: "https://proofgate-site-verifier.workers.dev",
    } as never);

    expect(response.status).toBe(201);
    const result = await response.json() as any;
    expect(result).toMatchObject({ stage: "approval_required", siteId: expect.stringMatching(/^maya-studio-/), approval: { approvalId: expect.stringMatching(/^approval-/) } });
    expect(result.previewUrl).toMatch(/^http:\/\/proofgate\.test\/preview\/pgp_/);
    expect(result.approval.checklist).toContain("Approval checklist");
    expect(admin.upsertMerchant).toHaveBeenCalledWith(expect.objectContaining({ businessType: "tailor" }), expect.stringMatching(/^aesgcm:v1:/), expect.anything());
    expect(admin.createCandidate).toHaveBeenCalledWith(expect.objectContaining({ actor: expect.stringMatching(/^studio:/), spec: expect.objectContaining({ businessType: "tailor" }) }), expect.anything());
    expect(admin.mintVerification).toHaveBeenCalledOnce();
    expect(verifier.run).toHaveBeenCalledWith(expect.objectContaining({ previewUrl: result.previewUrl, evidenceUrl: expect.stringMatching(/^http:\/\/proofgate\.test\/verification\/pgv_/) }));
    expect(admin.createReleaseRequest).toHaveBeenCalledOnce();
    expect(admin.createApproval).toHaveBeenCalledWith(expect.objectContaining({ type: "release" }), expect.anything());
  });

  it("returns one consolidated Studio correction instead of making up missing facts", async () => {
    const admin = adminBoundary();
    (admin.getStudioSession as ReturnType<typeof vi.fn>).mockResolvedValue({ merchantId: "merchant-1234567890abcdef", ownerWaIdHash: "a".repeat(64), expiresAt: Date.now() + 10_000 });
    (admin.listStudioProjects as ReturnType<typeof vi.fn>).mockResolvedValue([{
      projectId: "project-draft-1", revisionId: "revision-draft-1", intent: "website", createdAt: Date.now(),
      project: { projectId: "project-draft-1", intent: "website", businessName: "Draft Business", description: "A local service", siteStyle: "minimal", referenceAssetIds: [], suppliedClaims: [] },
    }]);
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/api/studio/projects/project-draft-1/build", {
      method: "POST", headers: { cookie: "axcas_session=abcdefghijklmnopqrstuvwxyz1234567890" },
    }, { PROOFGATE_SERVICE_SECRET: "service-secret" } as never);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ stage: "needs_input", missing: ["orderWhatsAppNumber", "fulfillmentArea", "leadTime", "offerings", "referenceAssetIds"] });
    expect(admin.createCandidate).not.toHaveBeenCalled();
  });

  it("publishes only after the WhatsApp-linked Studio owner accepts the single checklist", async () => {
    const admin = adminBoundary() as GrowthAdminBoundary & { resolveStudioApproval: ReturnType<typeof vi.fn> };
    admin.resolveStudioApproval = vi.fn(async () => ({ accepted: true }));
    (admin.getStudioSession as ReturnType<typeof vi.fn>).mockResolvedValue({ merchantId: "merchant-1234567890abcdef", ownerWaIdHash: "a".repeat(64), expiresAt: Date.now() + 10_000 });
    (admin.promoteRelease as ReturnType<typeof vi.fn>).mockResolvedValue({ promoted: true, siteId: "maya-studio-abcdef", versionId: "site-revision-1" });
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/api/studio/approvals/approval-12345678", {
      method: "POST", headers: { "content-type": "application/json", cookie: "axcas_session=abcdefghijklmnopqrstuvwxyz1234567890" },
      body: JSON.stringify({ decision: "approved" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ stage: "published", siteUrl: "http://proofgate.test/s/maya-studio-abcdef" });
    expect(admin.resolveStudioApproval).toHaveBeenCalledWith(expect.objectContaining({
      approvalId: "approval-12345678", merchantId: "merchant-1234567890abcdef", ownerWaIdHash: "a".repeat(64), decision: "approved",
    }), undefined);
    expect(admin.promoteRelease).toHaveBeenCalledOnce();
  });
  it("shows the sellable WhatsApp-first customer journey at the public root", async () => {
    const response = await createApp(undefined, boundary(), adminBoundary()).request("http://proofgate.test/");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    const html = await response.text();
    expect(html).toContain('data-pg="product-home"');
    expect(html).toContain("Axcas — websites and reels for small businesses");
    expect(html).toContain("Axcas agent");
    expect(html).toContain("Start in WhatsApp for speed");
    expect(html).toContain('data-pg="start-whatsapp"');
    expect(html).toContain('href="https://wa.me/15556537153?text=START%20AXCAS"');
    expect(html).toContain("Photos + offerings + voice note");
    expect(html).toContain("Private beta");
    expect(html).toContain("AWS-hosted Hermes is live");
    expect(html).not.toContain("durable Hermes hosting");
    expect(html).toContain("For small businesses");
    expect(html).toContain('data-pg="start-studio"');
    expect(html).toContain('href="/studio"');
    expect(html).toContain("Demo journey — not live merchant proof");
    expect(html).not.toContain("For home bakeries");
    expect(html).not.toContain("Saturday Sessions");
    expect(html).not.toContain(">ProofGate<");
  });

  it("reports the current WhatsApp growth phase", async () => {
    const response = await createApp(undefined, boundary(), adminBoundary()).request("http://proofgate.test/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ service: "proofgate-edge", phase: "whatsapp-growth-p0", status: "ok" });
  });

  it.each([
    ["/privacy", "Axcas Privacy Policy"],
    ["/data-deletion", "Delete your Axcas data"],
    ["/terms", "Axcas Terms of Service"],
  ])("serves the public legal page %s", async (path, heading) => {
    const response = await createApp(undefined, boundary(), adminBoundary()).request(`http://proofgate.test${path}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(await response.text()).toContain(heading);
  });
  it("registers exactly three social variants under one campaign approval", async () => {
    const admin = adminBoundary();
    const owner = "919876543210";
    const tenant = await deriveTenantIdentity(owner);
    const campaign = await (await import("../../packages/social/src/experiment")).createSocialCampaign({
      schemaVersion: 1, campaignId: "launch-cakes-1", merchantId: tenant.merchantId, platform: "instagram", objective: "engagement",
      variants: [
        { variantId: "variant-hook", changedDimension: "hook", hypothesis: "Question hook wins", reelAssetId: "reel-hook", caption: "Which cake?", scheduledAt: 1_754_000_000_000 },
        { variantId: "variant-cover", changedDimension: "cover", hypothesis: "Cover wins", reelAssetId: "reel-cover", caption: "Fresh cakes", scheduledAt: 1_754_086_400_000 },
        { variantId: "variant-cta", changedDimension: "cta", hypothesis: "CTA wins", reelAssetId: "reel-cta", caption: "Message to order", scheduledAt: 1_754_172_800_000 },
      ], metricCheckpointsHours: [2, 24, 72], explorationRate: 0.2, createdAt: 1_753_900_000_000,
    });
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/social-campaign", {
      method: "POST",
      headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": owner },
      body: JSON.stringify(campaign),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(response.status).toBe(202);
    expect(admin.registerSocialCampaign).toHaveBeenCalledWith(expect.objectContaining({ campaign: expect.objectContaining({ variants: expect.arrayContaining([expect.objectContaining({ variantId: "variant-hook" })]) }) }), expect.anything());
    expect(admin.createApproval).toHaveBeenCalledWith(expect.objectContaining({ type: "social_campaign", scopeHash: campaign.scopeHash }), expect.anything());
  });
  it("persists a merchant policy once and evaluates routine work without prompting", async () => {
    const admin = adminBoundary();
    const owner = "919876543210";
    const tenant = await deriveTenantIdentity(owner);
    const policy = {
      schemaVersion: 1,
      policyId: "policy-fast-1",
      ...tenant,
      mode: "fast_pilot",
      autonomousActions: ["create_candidate", "run_verification", "summarize_metrics"],
      createdAt: 1_754_000_000_000,
    };
    const app = createApp(undefined, boundary(), admin);
    const saved = await app.request("http://proofgate.test/internal/policy", {
      method: "POST",
      headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": owner },
      body: JSON.stringify(policy),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(saved.status).toBe(201);
    expect(admin.saveDecisionPolicy).toHaveBeenCalledWith(expect.objectContaining({ policy, policyHash: expect.stringMatching(/^[a-f0-9]{64}$/) }), expect.anything());

    (admin.getDecisionPolicy as ReturnType<typeof vi.fn>).mockResolvedValue(policy);
    const decision = await app.request("http://proofgate.test/internal/decision", {
      method: "POST",
      headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": owner },
      body: JSON.stringify({ schemaVersion: 1, merchantId: tenant.merchantId, action: "create_candidate" }),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(decision.status).toBe(200);
    expect(await decision.json()).toMatchObject({ decision: "allow", reason: "merchant_policy_allows_reversible_action" });
  });
  it("serves a version-pinned bakery page and appends a privacy-safe view", async () => {
    const growth = boundary();
    const response = await createApp(undefined, growth).request("http://proofgate.test/s/mayas-oven");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-proofgate-version-id")).toBe("bakery-v1");
    expect(response.headers.get("set-cookie")).toContain("pgsid=");
    expect(await response.text()).toContain('data-pg="catalog"');
    expect(growth.events[0]).toMatchObject({ type: "page_view", siteId: "mayas-oven", versionId: "bakery-v1" });
    expect(growth.events[0]).not.toHaveProperty("ip");
  });

  it("returns one expiring visible preview URL with a candidate", async () => {
    const admin = adminBoundary();
    const owner = "919876543210";
    const tenant = await deriveTenantIdentity(owner);
    const spec = { ...initialBakerySiteSpec, business: { ...initialBakerySiteSpec.business, merchantId: tenant.merchantId } };
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/candidate", {
      method: "POST",
      headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": owner },
      body: JSON.stringify({ versionId: "bakery-v1", spec }),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(response.status).toBe(201);
    const result = await response.json() as { previewUrl: string; previewExpiresAt: number };
    expect(result.previewUrl).toMatch(/^http:\/\/proofgate\.test\/preview\/pgp_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(result.previewExpiresAt).toBeGreaterThan(Date.now());

    const preview = await createApp(undefined, boundary(), admin).request(result.previewUrl, {}, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(preview.status).toBe(200);
    expect(preview.headers.get("cache-control")).toBe("private, no-store");
    expect(preview.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    const html = await preview.text();
    expect(html).toContain('data-pg="catalog"');
    expect(html).toContain(`${new URL(result.previewUrl).pathname}/assets/cake-1`);
  });

  it("rejects tampered preview links and hides assets outside the candidate", async () => {
    const admin = adminBoundary();
    const owner = "919876543210";
    const tenant = await deriveTenantIdentity(owner);
    const spec = { ...initialBakerySiteSpec, business: { ...initialBakerySiteSpec.business, merchantId: tenant.merchantId } };
    const candidate = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/candidate", {
      method: "POST",
      headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": owner },
      body: JSON.stringify({ versionId: "bakery-v1", spec }),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    const { previewUrl } = await candidate.json() as { previewUrl: string };
    const token = new URL(previewUrl).pathname.split("/").pop()!;
    const app = createApp(undefined, boundary(), admin);
    const tampered = await app.request(`http://proofgate.test/preview/${token.slice(0, -1)}x`, {}, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(tampered.status).toBe(403);
    const selected = await app.request(`${previewUrl}/assets/cake-1`, {}, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(selected.status).toBe(200);
    const hidden = await app.request(`${previewUrl}/assets/other-merchant-photo`, {}, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(hidden.status).toBe(404);
  });

  it("records a CTA click before redirecting to a prefilled WhatsApp order", async () => {
    const growth = boundary();
    const response = await createApp(undefined, growth).request("http://proofgate.test/r/whatsapp/mayas-oven/chocolate-truffle?source=instagram&campaign=launch", {
      headers: { cookie: "pgsid=session-1" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://wa.me/919876543210?text=I%27d%20like%20to%20order%20the%20Chocolate%20Truffle%20cake.");
    expect(growth.events[0]).toMatchObject({ type: "whatsapp_cta_click", itemId: "chocolate-truffle", source: "instagram", campaign: "launch" });
  });

  it("intercepts authenticated ProofGate approvals and forwards ordinary Meta events", async () => {
    const secret = "meta-secret";
    const approvalBody = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "919876543210", id: "wamid.tap", type: "interactive", interactive: { button_reply: { id: "pg:approval-1:approve" } } }] } }] }] });
    const growth = boundary();
    const app = createApp(undefined, growth);
    const approved = await app.request("http://proofgate.test/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": await metaSignatureForTest(approvalBody, secret) },
      body: approvalBody,
    }, { META_APP_SECRET: secret, META_VERIFY_TOKEN: "verify" });
    expect(approved.status).toBe(200);
    expect(growth.resolveApproval).toHaveBeenCalledOnce();
    expect(growth.forwardToHermes).not.toHaveBeenCalled();

    const ordinaryBody = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ from: "919876543210", id: "wamid.text", type: "text", text: { body: "Build my site" } }] } }] }] });
    const forwarded = await app.request("http://proofgate.test/whatsapp/webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "x-hub-signature-256": await metaSignatureForTest(ordinaryBody, secret) },
      body: ordinaryBody,
    }, { META_APP_SECRET: secret, META_VERIFY_TOKEN: "verify" });
    expect(forwarded.status).toBe(202);
    expect(growth.forwardToHermes).toHaveBeenCalledOnce();
    expect(new TextDecoder().decode((growth.forwardToHermes as any).mock.calls[0][0])).toBe(ordinaryBody);
  });

  it("fails closed on invalid provider signatures", async () => {
    const growth = boundary();
    const response = await createApp(undefined, growth).request("http://proofgate.test/whatsapp/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=bad" },
      body: "{}",
    }, { META_APP_SECRET: "meta-secret", META_VERIFY_TOKEN: "verify" });
    expect(response.status).toBe(401);
    expect(growth.forwardToHermes).not.toHaveBeenCalled();
  });

  it("serves immutable public assets without exposing storage keys", async () => {
    const response = await createApp(undefined, boundary()).request("http://proofgate.test/assets/cake-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");
    expect(response.headers.get("etag")).toBe("asset-etag");
  });

  it("stores immutable assets in Convex when R2 is unavailable", async () => {
    const admin = adminBoundary();
    const owner = "919876543210";
    const tenant = await deriveTenantIdentity(owner);
    const scopedAssetId = tenantScopedAssetId(tenant, "cake-2");
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xdb]);
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/assets/cake-2", {
      method: "PUT",
      headers: {
        authorization: "Bearer service-secret",
        "content-type": "image/jpeg",
        "x-hermes-user-id": owner,
        "x-proofgate-merchant-id": tenant.merchantId,
        "x-proofgate-source-message-id": "wamid.photo-2",
      },
      body: jpeg,
    }, { PROOFGATE_SERVICE_SECRET: "service-secret", CONVEX_URL: "https://example.convex.cloud" });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ accepted: true, localAssetId: "cake-2", assetId: scopedAssetId, storageBackend: "convex" });
    expect(admin.uploadAsset).toHaveBeenCalledWith(expect.objectContaining({
      assetId: scopedAssetId,
      merchantId: tenant.merchantId,
      sourceProviderMessageId: "wamid.photo-2",
      contentType: "image/jpeg",
      body: jpeg,
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }), expect.anything());
    expect(admin.registerAsset).not.toHaveBeenCalled();
  });

  it("accepts at most 16 MiB and rejects the next byte", async () => {
    const owner = "919876543210";
    const tenant = await deriveTenantIdentity(owner);
    const acceptedAdmin = adminBoundary();
    const max = new Uint8Array(16 * 1024 * 1024);
    max.set([0xff, 0xd8, 0xff]);
    const accepted = await createApp(undefined, boundary(), acceptedAdmin).request("http://proofgate.test/internal/assets/max-jpeg", {
      method: "PUT",
      headers: {
        authorization: "Bearer service-secret", "content-type": "image/jpeg",
        "x-hermes-user-id": owner, "x-proofgate-merchant-id": tenant.merchantId, "x-proofgate-source-message-id": "wamid.max",
      },
      body: max,
    }, { PROOFGATE_SERVICE_SECRET: "service-secret", CONVEX_URL: "https://example.convex.cloud" });
    expect(accepted.status).toBe(201);
    expect(acceptedAdmin.uploadAsset).toHaveBeenCalledOnce();

    const rejectedAdmin = adminBoundary();
    const over = new Uint8Array(16 * 1024 * 1024 + 1);
    over.set([0xff, 0xd8, 0xff]);
    const rejected = await createApp(undefined, boundary(), rejectedAdmin).request("http://proofgate.test/internal/assets/over-jpeg", {
      method: "PUT",
      headers: {
        authorization: "Bearer service-secret", "content-type": "image/jpeg",
        "x-hermes-user-id": owner, "x-proofgate-merchant-id": tenant.merchantId, "x-proofgate-source-message-id": "wamid.over",
      },
      body: over,
    }, { PROOFGATE_SERVICE_SECRET: "service-secret", CONVEX_URL: "https://example.convex.cloud" });
    expect(rejected.status).toBe(413);
    expect(rejectedAdmin.uploadAsset).not.toHaveBeenCalled();
  }, 20_000);

  it("rejects media whose magic bytes do not match its declared type", async () => {
    const admin = adminBoundary();
    const owner = "919876543210";
    const tenant = await deriveTenantIdentity(owner);
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/assets/not-a-jpeg", {
      method: "PUT",
      headers: {
        authorization: "Bearer service-secret", "content-type": "image/jpeg",
        "x-hermes-user-id": owner, "x-proofgate-merchant-id": tenant.merchantId, "x-proofgate-source-message-id": "wamid.fake",
      },
      body: new Uint8Array([0x3c, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74, 0x3e]),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret", CONVEX_URL: "https://example.convex.cloud" });
    expect(response.status).toBe(415);
    expect(admin.uploadAsset).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant asset uploads before storage", async () => {
    const admin = adminBoundary();
    const owner = "919876543210";
    const other = await deriveTenantIdentity("15551234567");
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/assets/bread-1", {
      method: "PUT",
      headers: {
        authorization: "Bearer service-secret", "content-type": "image/jpeg", "x-hermes-user-id": owner,
        "x-proofgate-merchant-id": other.merchantId, "x-proofgate-source-message-id": "wamid.cross-tenant",
      },
      body: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(response.status).toBe(403);
    expect(admin.uploadAsset).not.toHaveBeenCalled();
    expect(admin.registerAsset).not.toHaveBeenCalled();
  });

  it("rejects a candidate owned by another WhatsApp tenant", async () => {
    const admin = adminBoundary();
    const owner = "919876543210";
    const other = await deriveTenantIdentity("15551234567");
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/candidate", {
      method: "POST",
      headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": owner },
      body: JSON.stringify({ versionId: "tenant-v1", spec: { ...initialBakerySiteSpec, business: { ...initialBakerySiteSpec.business, merchantId: other.merchantId } } }),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(response.status).toBe(403);
    expect(admin.createCandidate).not.toHaveBeenCalled();
  });

  it("accepts a typed Hermes intake only from the bound owner", async () => {
    const admin = adminBoundary();
    const owner = "919876543210";
    const identity = await deriveTenantIdentity(owner);
    const brief = {
      schemaVersion: 1,
      ...identity,
      businessType: "home_bakery",
      businessName: "Maya's Oven",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      description: "Small-batch celebration cakes baked to order.",
      orderWhatsAppNumber: "+919876543210",
      fulfillmentArea: "Bengaluru",
      leadTime: "Order at least 48 hours ahead.",
      suppliedClaims: ["Eggless options available on request."],
      catalog: [{ name: "Chocolate Truffle", priceMinor: 120000, currency: "INR", imageAssetId: "cake-1" }],
    };
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/intake", {
      method: "POST",
      headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": owner },
      body: JSON.stringify(brief),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret", PROOFGATE_DATA_KEY: btoa("12345678901234567890123456789012") });
    expect(response.status).toBe(201);
    expect(admin.upsertMerchant).toHaveBeenCalledOnce();
    expect(String((admin.upsertMerchant as any).mock.calls[0][1])).toMatch(/^aesgcm:v1:/);

    const rejected = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/intake", {
      method: "POST",
      headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": "15551234567" },
      body: JSON.stringify(brief),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret", PROOFGATE_DATA_KEY: btoa("12345678901234567890123456789012") });
    expect(rejected.status).toBe(403);
  });

  it("derives distinct merchant identities server-side for every WhatsApp sender", async () => {
    const firstAdmin = adminBoundary();
    const secondAdmin = adminBoundary();
    const input = {
      schemaVersion: 1,
      businessType: "home_bakery",
      businessName: "Neighbourhood Oven",
      timezone: "Asia/Kolkata",
      locale: "en-IN",
      description: "Small-batch breads baked to order.",
      orderWhatsAppNumber: "+919876543210",
      fulfillmentArea: "Hubli",
      leadTime: "Order one day ahead.",
      suppliedClaims: [],
      catalog: [{ name: "Sourdough", priceMinor: 18000, currency: "INR", imageAssetId: "loaf-1" }],
    };
    const app = createApp(undefined, boundary(), firstAdmin);
    const first = await app.request("http://proofgate.test/internal/intake", {
      method: "POST", headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": "919876543210" }, body: JSON.stringify(input),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret", PROOFGATE_DATA_KEY: btoa("12345678901234567890123456789012") });
    const second = await createApp(undefined, boundary(), secondAdmin).request("http://proofgate.test/internal/intake", {
      method: "POST", headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": "15551234567" }, body: JSON.stringify({ ...input, orderWhatsAppNumber: "+15551234567" }),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret", PROOFGATE_DATA_KEY: btoa("12345678901234567890123456789012") });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    const firstBrief = (firstAdmin.upsertMerchant as any).mock.calls[0][0];
    const secondBrief = (secondAdmin.upsertMerchant as any).mock.calls[0][0];
    expect(firstBrief).toMatchObject(await deriveTenantIdentity("919876543210"));
    expect(secondBrief).toMatchObject(await deriveTenantIdentity("15551234567"));
    expect(firstBrief.merchantId).not.toBe(secondBrief.merchantId);
  });

  it("rejects a merchant identity supplied by another tenant", async () => {
    const owner = "919876543210";
    const attacker = await deriveTenantIdentity("15551234567");
    const response = await createApp(undefined, boundary(), adminBoundary()).request("http://proofgate.test/internal/intake", {
      method: "POST",
      headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": owner },
      body: JSON.stringify({
        schemaVersion: 1, ...attacker, businessType: "home_bakery", businessName: "Wrong Tenant", timezone: "Asia/Kolkata", locale: "en-IN",
        description: "Small-batch bakery.", orderWhatsAppNumber: "+919876543210", fulfillmentArea: "Hubli", leadTime: "24 hours",
        suppliedClaims: [], catalog: [{ name: "Bread", priceMinor: 10000, currency: "INR", imageAssetId: "bread-1" }],
      }),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret", PROOFGATE_DATA_KEY: btoa("12345678901234567890123456789012") });
    expect(response.status).toBe(403);
  });

  it("creates an immutable call batch but blocks delivery when Meta is not configured", async () => {
    const admin = adminBoundary();
    const owner = "919876543210";
    const tenant = await deriveTenantIdentity(owner);
    const batch = {
      batchId: "batch-1", merchantId: tenant.merchantId, leadIds: ["lead-1"], countries: ["IN"] as Array<"IN" | "US">, scriptVersion: "qualifier-v1",
      earliestAt: 1_800_000_000_000, latestAt: 1_800_003_600_000, maxAttemptsPerLead: 1 as const, costCapUsd: 5,
    };
    const { createCallBatch } = await import("../../packages/release-policy/src/growth-policy");
    const signed = await createCallBatch(batch);
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/call-batch", {
      method: "POST",
      headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": owner },
      body: JSON.stringify(signed),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ accepted: true, delivery: "blocked_missing_meta_configuration" });
    expect(admin.createCallBatch).toHaveBeenCalledOnce();
    expect(admin.createApproval).toHaveBeenCalledOnce();
  });

  it("accepts verifier evidence only through a scoped opaque capability route", async () => {
    const growth = boundary();
    const response = await createApp(undefined, growth).request("http://proofgate.test/verification/pgv_123456789012345678901234", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ evidenceId: "evidence-1", siteId: "mayas-oven", versionId: "bakery-v1", specHash: "a".repeat(64), runId: "run-1", passed: true, blockers: [], observedAt: Date.now(), report: { mobile: true, cta: true } }),
    });
    expect(response.status).toBe(201);
    expect(growth.submitVerification).toHaveBeenCalledOnce();
    expect((growth.submitVerification as any).mock.calls[0][0]).toMatchObject({ passed: true, blockers: [], reportHash: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it("creates a hash-bound release request without promoting it", async () => {
    const admin = adminBoundary();
    const owner = "919876543210";
    const tenant = await deriveTenantIdentity(owner);
    const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/release", {
      method: "POST",
      headers: { authorization: "Bearer service-secret", "content-type": "application/json", "x-hermes-user-id": owner },
      body: JSON.stringify({ siteId: "mayas-oven", merchantId: tenant.merchantId, versionId: "bakery-v1", specHash: "a".repeat(64) }),
    }, { PROOFGATE_SERVICE_SECRET: "service-secret" });
    expect(response.status).toBe(202);
    expect(admin.createReleaseRequest).toHaveBeenCalledOnce();
    expect(admin.createApproval).toHaveBeenCalledOnce();
    expect(admin.promoteRelease).not.toHaveBeenCalled();
  });

  it("delivers a private rendered reel through Meta before recording completion", async () => {
    const admin = adminBoundary();
    const putObject = {
      body: new Uint8Array([1, 2, 3]),
      httpMetadata: { contentType: "video/mp4" },
      arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
    };
    const bucket = { get: vi.fn(async (key: string) => key === "assets/reel-output-1" ? putObject : null) };
    const providerFetch = vi.fn(async (url: string) => url.endsWith("/media")
      ? new Response(JSON.stringify({ id: "media-1" }), { status: 200 })
      : new Response(JSON.stringify({ messages: [{ id: "wamid.reel-1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", providerFetch);
    try {
      const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/reel-delivery", {
        method: "POST",
        headers: { authorization: "Bearer service-secret", "content-type": "application/json" },
        body: JSON.stringify({ reelId: "reel-1", renderedAssetId: "reel-output-1", recipientWaId: "919876543210", caption: "Your approved reel" }),
      }, {
        PROOFGATE_SERVICE_SECRET: "service-secret", META_PHONE_NUMBER_ID: "123", META_ACCESS_TOKEN: "token",
        META_GRAPH_API_VERSION: "v20.0", PROOFGATE_ASSETS: bucket as any,
      });
      expect(response.status).toBe(201);
      expect(await response.json()).toMatchObject({ delivered: true, providerMessageId: "wamid.reel-1" });
      expect(admin.completeReel).toHaveBeenCalledWith("reel-1", "rendered", "reel-output-1", "wamid.reel-1", expect.anything());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("delivers a Convex-backed private reel when R2 is unavailable", async () => {
    const admin = adminBoundary();
    const providerFetch = vi.fn(async (url: string) => url.endsWith("/media")
      ? new Response(JSON.stringify({ id: "media-convex-1" }), { status: 200 })
      : new Response(JSON.stringify({ messages: [{ id: "wamid.reel-convex-1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", providerFetch);
    try {
      const response = await createApp(undefined, boundary(), admin).request("http://proofgate.test/internal/reel-delivery", {
        method: "POST",
        headers: { authorization: "Bearer service-secret", "content-type": "application/json" },
        body: JSON.stringify({ reelId: "reel-1", renderedAssetId: "reel-output-1", recipientWaId: "919876543210" }),
      }, {
        PROOFGATE_SERVICE_SECRET: "service-secret", CONVEX_URL: "https://example.convex.cloud",
        META_PHONE_NUMBER_ID: "123", META_ACCESS_TOKEN: "token", META_GRAPH_API_VERSION: "v20.0",
      });
      expect(response.status).toBe(201);
      expect(admin.getPrivateAsset).toHaveBeenCalledWith("reel-output-1", expect.anything());
      expect(await response.json()).toMatchObject({ delivered: true, providerMessageId: "wamid.reel-convex-1" });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
