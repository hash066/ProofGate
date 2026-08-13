import { describe, expect, it } from "vitest";

import { initialBakerySiteSpec } from "../../packages/domain/src/growth";
import { renderBakerySite, renderBusinessSite } from "../../packages/renderer/src/render-bakery-site";
import {
  extractProofGateApproval,
  metaSignatureForTest,
  verifyMetaWebhookSignature,
} from "../../packages/whatsapp-io/src/meta-webhook";
import { authenticateVapiWebhook, buildQualificationSquad } from "../../packages/calls/src/vapi";
import { shouldProposeImprovement } from "../../packages/release-policy/src/growth-policy";

describe("growth integrations", () => {
  it("proposes improvements only on request, after seven days, or at 100 qualified views", () => {
    expect(shouldProposeImprovement({ requestedNow: false, elapsedDays: 6.9, qualifiedViews: 99 })).toMatchObject({ eligible: false });
    expect(shouldProposeImprovement({ requestedNow: true, elapsedDays: 0, qualifiedViews: 0 })).toEqual({ eligible: true, reason: "merchant_requested" });
    expect(shouldProposeImprovement({ requestedNow: false, elapsedDays: 7, qualifiedViews: 1 })).toEqual({ eligible: true, reason: "seven_days" });
    expect(shouldProposeImprovement({ requestedNow: false, elapsedDays: 1, qualifiedViews: 100 })).toEqual({ eligible: true, reason: "one_hundred_views" });
  });
  it("renders a constrained bakery catalog with tracked WhatsApp links", () => {
    const html = renderBakerySite(initialBakerySiteSpec, { versionId: "bakery-v1", specHash: "a".repeat(64) });
    expect(html).toContain('data-pg="catalog"');
    expect(html).toContain("/r/whatsapp/mayas-oven/chocolate-truffle");
    expect(html).not.toContain("wa.me/");
    expect(html).not.toContain("<script>");
  });

  it("renders a generic service site without bakery-only language", () => {
    const tutorSpec = {
      ...initialBakerySiteSpec,
      businessType: "tutor" as const,
      siteId: "bright-maths",
      business: { ...initialBakerySiteSpec.business, name: "Bright Maths", description: "Maths tutoring for school students." },
      hero: { ...initialBakerySiteSpec.hero, headline: "Maths that finally makes sense.", subheadline: "Weekly online and local classes." },
      fulfillment: { area: "Bengaluru", leadTime: "Message to confirm a class time." },
      catalog: [{ ...initialBakerySiteSpec.catalog[0], id: "class-8-maths", name: "Class 8 Maths", description: "Small-group weekly lessons.", priceMinor: undefined, whatsappMessage: "I'd like to ask about Class 8 Maths." }],
      whatsappCta: { ...initialBakerySiteSpec.whatsappCta, label: "Enquire on WhatsApp" },
      policies: { ordering: "Class times are confirmed on WhatsApp." },
      seo: { ...initialBakerySiteSpec.seo, title: "Bright Maths tutoring", description: "Local and online maths tutoring." },
    };
    const html = renderBusinessSite(tutorSpec, { versionId: "tutor-v1", specHash: "c".repeat(64) });
    expect(html).toContain("Services");
    expect(html).toContain("Contact for price");
    expect(html).not.toContain("celebration cake");
    expect(html).not.toContain("Made to order");
  });

  it("escapes merchant content instead of treating it as page code", () => {
    const spec = {
      ...initialBakerySiteSpec,
      hero: { ...initialBakerySiteSpec.hero, headline: "<img src=x onerror=alert(1)>" },
    };
    expect(() => renderBakerySite(spec as never, { versionId: "v1", specHash: "b".repeat(64) })).toThrow();
  });

  it("verifies Meta signatures and extracts only signed ProofGate taps", async () => {
    const secret = "meta-app-secret";
    const body = JSON.stringify({
      entry: [{ changes: [{ value: { messages: [{ from: "919876543210", id: "wamid.tap", type: "interactive", interactive: { button_reply: { id: "pg:approval-1:approve", title: "Approve" } } }] } }] }],
    });
    const signature = await metaSignatureForTest(body, secret);
    expect(await verifyMetaWebhookSignature(body, signature, secret)).toBe(true);
    expect(await verifyMetaWebhookSignature(`${body} `, signature, secret)).toBe(false);
    expect(extractProofGateApproval(JSON.parse(body))).toEqual({
      approvalId: "approval-1",
      decision: "approved",
      senderWaId: "919876543210",
      providerMessageId: "wamid.tap",
    });
  });

  it("builds a consent-first Vapi squad and authenticates callbacks", async () => {
    const squad = buildQualificationSquad({ merchantName: "Maya's Oven", productSummary: "celebration cakes" });
    expect(squad.members[0].assistant.artifactPlan.recordingEnabled).toBe(false);
    expect(squad.members[0].assistant.artifactPlan.transcriptPlan.enabled).toBe(false);
    expect(squad.members[1].assistant.artifactPlan.recordingEnabled).toBe(true);
    expect(squad.members[1].assistant.systemPrompt).toContain("AI assistant");

    const body = JSON.stringify({ message: { type: "end-of-call-report" } });
    const timestamp = "1800000000";
    const secret = "vapi-webhook-secret";
    const signature = await metaSignatureForTest(`${timestamp}.${body}`, secret);
    expect(await authenticateVapiWebhook(body, { timestamp, signature }, secret, 1_800_000_030)).toBe(true);
    expect(await authenticateVapiWebhook(body, { timestamp, signature }, secret, 1_800_000_400)).toBe(false);
  });
});
