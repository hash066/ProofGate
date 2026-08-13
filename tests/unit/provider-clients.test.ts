import { describe, expect, it, vi } from "vitest";

import { sendActionRequiredTemplate, sendApprovalButtons, sendVideoByMediaId, uploadMetaMedia } from "../../packages/whatsapp-io/src/meta-client";
import { createQualificationCalls } from "../../packages/calls/src/vapi-client";
import { createInstagramReelContainer, getInstagramMediaInsights, publishInstagramReel } from "../../packages/social/src/instagram-client";

describe("provider clients", () => {
  it("sends signed-scope approval choices as native WhatsApp buttons", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.interactive.action.buttons.map((button: any) => button.reply.id)).toEqual([
        "pg:approval-1:approve",
        "pg:approval-1:deny",
      ]);
      return new Response(JSON.stringify({ messages: [{ id: "wamid.prompt" }] }), { status: 200 });
    });
    expect(await sendApprovalButtons({
      graphApiVersion: "v20.0", phoneNumberId: "123456789012345", accessToken: "token", recipientWaId: "919876543210",
      approvalId: "approval-1", body: "Approve this exact call batch?", fetcher,
    })).toEqual({ providerMessageId: "wamid.prompt" });
  });

  it("uses a pre-approved action-required template outside the service window", async () => {
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.template).toEqual({ name: "proofgate_action_required", language: { code: "en" } });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.template" }] }), { status: 200 });
    });
    expect((await sendActionRequiredTemplate({ graphApiVersion: "v20.0", phoneNumberId: "123", accessToken: "token", recipientWaId: "15551234567", templateName: "proofgate_action_required", fetcher })).providerMessageId).toBe("wamid.template");
  });

  it("uploads a private reel to Meta and sends it by media ID", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.endsWith("/media")) return new Response(JSON.stringify({ id: "meta-media-1" }), { status: 200 });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.reel" }] }), { status: 200 });
    });
    const media = await uploadMetaMedia({
      graphApiVersion: "v20.0", phoneNumberId: "123", accessToken: "token",
      bytes: new Uint8Array([1, 2, 3]), contentType: "video/mp4", filename: "reel-1.mp4", fetcher,
    });
    expect(media).toEqual({ mediaId: "meta-media-1" });
    expect(requests[0].init?.body).toBeInstanceOf(FormData);

    expect(await sendVideoByMediaId({
      graphApiVersion: "v20.0", phoneNumberId: "123", accessToken: "token", recipientWaId: "919876543210",
      mediaId: media.mediaId, caption: "Your approved reel", fetcher,
    })).toEqual({ providerMessageId: "wamid.reel" });
    expect(JSON.parse(String(requests[1].init?.body))).toMatchObject({ type: "video", video: { id: "meta-media-1", caption: "Your approved reel" } });
  });

  it("creates one correlated Vapi call per approved lead", async () => {
    const requests: any[] = [];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      requests.push(JSON.parse(String(init?.body)));
      return new Response(JSON.stringify({ id: `call-${requests.length}` }), { status: 201 });
    });
    const results = await createQualificationCalls({
      apiKey: "vapi-key", phoneNumberId: "phone-id", squadId: "squad-id", batchId: "batch-1",
      earliestAt: "2027-01-15T10:00:00.000Z",
      leads: [{ leadId: "lead-1", number: "+919876543210" }, { leadId: "lead-2", number: "+15551234567" }],
      fetcher,
    });
    expect(results).toEqual([{ leadId: "lead-1", callId: "call-1" }, { leadId: "lead-2", callId: "call-2" }]);
    expect(requests[0]).toMatchObject({ squadId: "squad-id", phoneNumberId: "phone-id", customer: { number: "+919876543210" }, metadata: { batchId: "batch-1", leadId: "lead-1" } });
  });

  it("uses Meta's container then publish flow and reads normalized reel insights", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init });
      if (url.includes("/media?")) return new Response(JSON.stringify({ id: "container-1" }), { status: 200 });
      if (url.includes("/media_publish")) return new Response(JSON.stringify({ id: "media-1" }), { status: 200 });
      return new Response(JSON.stringify({ data: [
        { name: "reach", values: [{ value: 120 }] },
        { name: "views", values: [{ value: 140 }] },
        { name: "shares", values: [{ value: 8 }] },
        { name: "comments", values: [{ value: 3 }] },
        { name: "likes", values: [{ value: 15 }] },
        { name: "saved", values: [{ value: 6 }] },
        { name: "ig_reels_avg_watch_time", values: [{ value: 11000 }] },
      ] }), { status: 200 });
    });
    const container = await createInstagramReelContainer({ graphApiVersion: "v26.0", igUserId: "ig-1", accessToken: "token", videoUrl: "https://cdn.example/reel.mp4", caption: "Fresh cakes", fetcher });
    expect(container).toEqual({ containerId: "container-1" });
    await expect(publishInstagramReel({ graphApiVersion: "v26.0", igUserId: "ig-1", accessToken: "token", containerId: container.containerId, fetcher })).resolves.toEqual({ mediaId: "media-1" });
    await expect(getInstagramMediaInsights({ graphApiVersion: "v26.0", mediaId: "media-1", accessToken: "token", fetcher })).resolves.toMatchObject({ reach: 120, plays: 140, shares: 8, avgWatchTimeSeconds: 11 });
    expect(requests[0].url).toContain("media_type=REELS");
  });
});
