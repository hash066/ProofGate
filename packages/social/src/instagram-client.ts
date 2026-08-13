import { z } from "zod";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
type InstagramClientBase = { graphApiVersion: string; accessToken: string; fetcher?: Fetcher };

const IdResponseSchema = z.object({ id: z.string().min(1).max(256) });
const InsightResponseSchema = z.object({
  data: z.array(z.object({
    name: z.string(),
    values: z.array(z.object({ value: z.union([z.number(), z.string()]) })).optional(),
    value: z.union([z.number(), z.string()]).optional(),
  })),
});

function assertVersion(value: string): void {
  if (!/^v\d+\.\d+$/.test(value)) throw new Error("invalid Graph API version");
}

function numericInsight(data: z.infer<typeof InsightResponseSchema>["data"], names: string[]): number {
  for (const name of names) {
    const metric = data.find((entry) => entry.name === name);
    const value = metric?.values?.[0]?.value ?? metric?.value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && Number.isFinite(Number(value))) return Number(value);
  }
  return 0;
}

export async function createInstagramReelContainer(input: InstagramClientBase & {
  igUserId: string;
  videoUrl: string;
  caption: string;
  shareToFeed?: boolean;
}): Promise<{ containerId: string }> {
  assertVersion(input.graphApiVersion);
  if (!/^[a-zA-Z0-9._-]{2,256}$/.test(input.igUserId)) throw new Error("invalid Instagram user ID");
  const videoUrl = new URL(input.videoUrl);
  if (videoUrl.protocol !== "https:") throw new Error("Instagram reel URL must use HTTPS");
  if (input.caption.length < 1 || input.caption.length > 2_200) throw new Error("Instagram caption is invalid");
  const query = new URLSearchParams({ media_type: "REELS", video_url: videoUrl.toString(), caption: input.caption, share_to_feed: String(input.shareToFeed ?? true) });
  const response = await (input.fetcher ?? fetch)(`https://graph.facebook.com/${input.graphApiVersion}/${input.igUserId}/media?${query}`, {
    method: "POST", headers: { authorization: `Bearer ${input.accessToken}` },
  });
  if (!response.ok) throw new Error(`Instagram container creation failed with HTTP ${response.status}`);
  return { containerId: IdResponseSchema.parse(await response.json()).id };
}

export async function publishInstagramReel(input: InstagramClientBase & { igUserId: string; containerId: string }): Promise<{ mediaId: string }> {
  assertVersion(input.graphApiVersion);
  if (!/^[a-zA-Z0-9._-]{2,256}$/.test(input.igUserId) || !/^[a-zA-Z0-9._-]{2,256}$/.test(input.containerId)) throw new Error("invalid Instagram publish scope");
  const query = new URLSearchParams({ creation_id: input.containerId });
  const response = await (input.fetcher ?? fetch)(`https://graph.facebook.com/${input.graphApiVersion}/${input.igUserId}/media_publish?${query}`, {
    method: "POST", headers: { authorization: `Bearer ${input.accessToken}` },
  });
  if (!response.ok) throw new Error(`Instagram publish failed with HTTP ${response.status}`);
  return { mediaId: IdResponseSchema.parse(await response.json()).id };
}

export async function getInstagramMediaInsights(input: InstagramClientBase & { mediaId: string }): Promise<{
  reach: number; plays: number; shares: number; comments: number; likes: number; saves: number; avgWatchTimeSeconds: number;
}> {
  assertVersion(input.graphApiVersion);
  if (!/^[a-zA-Z0-9._-]{2,256}$/.test(input.mediaId)) throw new Error("invalid Instagram media ID");
  const metrics = "reach,views,plays,shares,comments,likes,saved,ig_reels_avg_watch_time";
  const response = await (input.fetcher ?? fetch)(`https://graph.instagram.com/${input.graphApiVersion}/${input.mediaId}/insights?metric=${metrics}`, {
    headers: { authorization: `Bearer ${input.accessToken}` },
  });
  if (!response.ok) throw new Error(`Instagram insights failed with HTTP ${response.status}`);
  const { data } = InsightResponseSchema.parse(await response.json());
  return {
    reach: numericInsight(data, ["reach"]),
    plays: numericInsight(data, ["views", "plays", "ig_reels_aggregated_all_plays_count"]),
    shares: numericInsight(data, ["shares"]),
    comments: numericInsight(data, ["comments"]),
    likes: numericInsight(data, ["likes"]),
    saves: numericInsight(data, ["saved"]),
    avgWatchTimeSeconds: numericInsight(data, ["ig_reels_avg_watch_time"]) / 1_000,
  };
}
