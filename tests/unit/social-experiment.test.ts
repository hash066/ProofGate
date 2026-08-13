import { describe, expect, it } from "vitest";

import {
  SocialCampaignSchema,
  chooseWinningVariant,
  createSocialCampaign,
  scoreMetricSnapshot,
} from "../../packages/social/src/experiment";

const baseCampaign = {
  schemaVersion: 1 as const,
  campaignId: "launch-cakes-1",
  merchantId: "merchant-demo",
  platform: "instagram" as const,
  objective: "engagement" as const,
  variants: [
    { variantId: "variant-hook", changedDimension: "hook" as const, hypothesis: "Question hook wins", reelAssetId: "reel-hook", caption: "Which cake would you choose?", scheduledAt: 1_754_000_000_000 },
    { variantId: "variant-cover", changedDimension: "cover" as const, hypothesis: "Close-up cover wins", reelAssetId: "reel-cover", caption: "Small-batch celebration cakes", scheduledAt: 1_754_086_400_000 },
    { variantId: "variant-cta", changedDimension: "cta" as const, hypothesis: "Direct CTA wins", reelAssetId: "reel-cta", caption: "Message us to order", scheduledAt: 1_754_172_800_000 },
  ],
  metricCheckpointsHours: [2, 24, 72] as const,
  explorationRate: 0.2,
  createdAt: 1_753_900_000_000,
};

describe("social campaign experiment", () => {
  it("requires exactly three unique scheduled variants", () => {
    expect(SocialCampaignSchema.parse(baseCampaign).variants).toHaveLength(3);
    expect(() => SocialCampaignSchema.parse({ ...baseCampaign, variants: baseCampaign.variants.slice(0, 2) })).toThrow();
    expect(() => SocialCampaignSchema.parse({ ...baseCampaign, variants: [baseCampaign.variants[0], baseCampaign.variants[0], baseCampaign.variants[2]] })).toThrow("unique");
  });

  it("creates an immutable scope hash covering every variant and schedule", async () => {
    const first = await createSocialCampaign(baseCampaign);
    const changed = await createSocialCampaign({
      ...baseCampaign,
      variants: baseCampaign.variants.map((variant, index) => index === 0 ? { ...variant, caption: "A changed caption" } : variant),
    });
    expect(first.scopeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(changed.scopeHash).not.toBe(first.scopeHash);
  });

  it("scores normalized engagement rather than raw vanity totals", () => {
    const lowReach = scoreMetricSnapshot({
      variantId: "variant-hook", checkpointHours: 72, durationSeconds: 15, reach: 100,
      plays: 100, likes: 10, comments: 2, saves: 8, shares: 6, avgWatchTimeSeconds: 12, ctaClicks: 5,
    });
    const highReachWeakRate = scoreMetricSnapshot({
      variantId: "variant-cover", checkpointHours: 72, durationSeconds: 15, reach: 1_000,
      plays: 1_000, likes: 20, comments: 2, saves: 4, shares: 4, avgWatchTimeSeconds: 4, ctaClicks: 5,
    });
    expect(lowReach.score).toBeGreaterThan(highReachWeakRate.score);
  });

  it("chooses a winner only from comparable 72-hour snapshots with enough reach", () => {
    const result = chooseWinningVariant([
      { variantId: "variant-hook", checkpointHours: 72, durationSeconds: 15, reach: 120, plays: 140, likes: 12, comments: 3, saves: 8, shares: 9, avgWatchTimeSeconds: 11, ctaClicks: 7 },
      { variantId: "variant-cover", checkpointHours: 72, durationSeconds: 15, reach: 150, plays: 160, likes: 10, comments: 1, saves: 3, shares: 2, avgWatchTimeSeconds: 7, ctaClicks: 3 },
      { variantId: "variant-cta", checkpointHours: 72, durationSeconds: 15, reach: 80, plays: 90, likes: 4, comments: 1, saves: 1, shares: 1, avgWatchTimeSeconds: 6, ctaClicks: 2 },
    ]);
    expect(result).toMatchObject({ status: "winner", variantId: "variant-hook" });
    expect(chooseWinningVariant([
      { variantId: "variant-hook", checkpointHours: 24, durationSeconds: 15, reach: 200, plays: 200, likes: 20, comments: 2, saves: 2, shares: 2, avgWatchTimeSeconds: 10, ctaClicks: 2 },
    ])).toEqual({ status: "insufficient_signal" });
  });
});
