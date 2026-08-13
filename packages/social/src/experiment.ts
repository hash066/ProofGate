import { z } from "zod";

const slug = z.string().regex(/^[a-z0-9-]{3,64}$/);
const assetId = z.string().regex(/^[a-zA-Z0-9_-]{3,128}$/);
const safeText = z.string().trim().min(1).max(1_500).refine((value) => !/[<>]|javascript:/i.test(value));
const timestamp = z.number().int().nonnegative();

export const SocialVariantSchema = z.object({
  variantId: slug,
  changedDimension: z.enum(["hook", "cover", "cta"]),
  hypothesis: safeText,
  reelAssetId: assetId,
  caption: safeText,
  scheduledAt: timestamp,
});

export const SocialCampaignSchema = z.object({
  schemaVersion: z.literal(1),
  campaignId: slug,
  merchantId: slug,
  platform: z.literal("instagram"),
  objective: z.enum(["engagement", "orders"]),
  variants: z.array(SocialVariantSchema).length(3),
  metricCheckpointsHours: z.tuple([z.literal(2), z.literal(24), z.literal(72)]),
  explorationRate: z.number().min(0.1).max(0.3),
  createdAt: timestamp,
}).superRefine((campaign, context) => {
  if (new Set(campaign.variants.map((variant) => variant.variantId)).size !== 3) {
    context.addIssue({ code: "custom", path: ["variants"], message: "variant IDs must be unique" });
  }
  if (new Set(campaign.variants.map((variant) => variant.reelAssetId)).size !== 3) {
    context.addIssue({ code: "custom", path: ["variants"], message: "variant reel assets must be unique" });
  }
  const schedules = campaign.variants.map((variant) => variant.scheduledAt);
  if (new Set(schedules).size !== 3) {
    context.addIssue({ code: "custom", path: ["variants"], message: "variant schedules must be unique" });
  }
});

export type SocialCampaignV1 = z.infer<typeof SocialCampaignSchema>;
export type SocialCampaign = SocialCampaignV1 & { scopeHash: string };
export type SocialCampaignInput = Omit<SocialCampaignV1, "metricCheckpointsHours"> & {
  metricCheckpointsHours: readonly [2, 24, 72];
};

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function createSocialCampaign(input: SocialCampaignInput): Promise<SocialCampaign> {
  const campaign = SocialCampaignSchema.parse(input);
  return { ...campaign, scopeHash: await sha256(canonicalize(campaign)) };
}

export const SocialMetricSnapshotSchema = z.object({
  variantId: slug,
  checkpointHours: z.union([z.literal(2), z.literal(24), z.literal(72)]),
  durationSeconds: z.number().positive().max(900),
  reach: z.number().int().nonnegative(),
  plays: z.number().int().nonnegative(),
  likes: z.number().int().nonnegative(),
  comments: z.number().int().nonnegative(),
  saves: z.number().int().nonnegative(),
  shares: z.number().int().nonnegative(),
  avgWatchTimeSeconds: z.number().nonnegative(),
  ctaClicks: z.number().int().nonnegative(),
});

export type SocialMetricSnapshot = z.infer<typeof SocialMetricSnapshotSchema>;

function clampRate(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function scoreMetricSnapshot(input: SocialMetricSnapshot): SocialMetricSnapshot & {
  score: number;
  watchRate: number;
  meaningfulEngagementRate: number;
  clickRate: number;
} {
  const snapshot = SocialMetricSnapshotSchema.parse(input);
  const denominator = Math.max(1, snapshot.reach);
  const watchRate = clampRate(snapshot.avgWatchTimeSeconds / snapshot.durationSeconds);
  const meaningfulEngagementRate = clampRate((snapshot.likes + snapshot.comments * 2 + snapshot.saves * 3 + snapshot.shares * 4) / denominator);
  const clickRate = clampRate(snapshot.ctaClicks / denominator);
  const score = watchRate * 0.45 + meaningfulEngagementRate * 0.35 + clickRate * 0.2;
  return { ...snapshot, score, watchRate, meaningfulEngagementRate, clickRate };
}

export function chooseWinningVariant(inputs: SocialMetricSnapshot[]):
  | { status: "insufficient_signal" }
  | { status: "winner"; variantId: string; score: number; runnerUpScore: number; confidenceMargin: number } {
  const snapshots = inputs.map((input) => SocialMetricSnapshotSchema.parse(input));
  const comparable = snapshots.filter((snapshot) => snapshot.checkpointHours === 72 && snapshot.reach >= 50);
  if (comparable.length !== 3 || new Set(comparable.map((snapshot) => snapshot.variantId)).size !== 3) return { status: "insufficient_signal" };
  const ranked = comparable.map(scoreMetricSnapshot).sort((left, right) => right.score - left.score || right.reach - left.reach || left.variantId.localeCompare(right.variantId));
  return {
    status: "winner",
    variantId: ranked[0].variantId,
    score: ranked[0].score,
    runnerUpScore: ranked[1].score,
    confidenceMargin: ranked[0].score - ranked[1].score,
  };
}
