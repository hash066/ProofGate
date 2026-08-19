import path from "node:path";

import type { ReelStyleProfileV1 } from "../../../packages/domain/src/studio";
import {
  explainerProps,
  fullInfographicProps,
  postHighlightProps,
  reelProps,
  talkingHalfProps,
  type StyleProfile,
} from "./schema";

export const OWNER_TEMPLATE_SOURCE = {
  repository: "https://github.com/gdpranavl/YouLeft_KumarKindaTemplates",
  commit: "ed8d037f7b35e0cc971521801df07e0edf69828c",
  authorization: "repository_owner",
} as const;

export const AXCAS_REEL_COMPOSITIONS = {
  kinetic_type: "InfographicReel",
  split_explainer: "SplitExplainerReel",
  talking_half: "TalkingHalfReel",
  full_infographic: "FullInfographicReel",
  post_highlight: "PostHighlightReel",
} as const;

const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);

export type OwnedTemplateAsset = {
  assetId: string;
  sourcePath: string;
  publicPath: string;
  kind: "image" | "video";
};

export type OwnedTemplateRender = {
  compositionId: (typeof AXCAS_REEL_COMPOSITIONS)[keyof typeof AXCAS_REEL_COMPOSITIONS];
  width: 1080;
  height: 1920;
  fps: 30;
  durationMs: number;
  props: unknown;
  assets: OwnedTemplateAsset[];
};

function withinRoot(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function collectAssets(profile: ReelStyleProfileV1, assetPaths: Record<string, string>, assetRoot: string): OwnedTemplateAsset[] {
  const selected = new Set(profile.referenceAssetIds);
  const used = new Map<string, "image" | "video">();
  for (const layer of profile.layers) {
    if (layer.kind !== "image" && layer.kind !== "video") continue;
    const assetId = layer.sourceAssetId as string;
    if (!selected.has(assetId)) throw new Error(`asset ${assetId} is not a selected reference`);
    used.set(assetId, layer.kind);
  }

  const root = path.resolve(assetRoot);
  return [...used].map(([assetId, kind]) => {
    const supplied = assetPaths[assetId];
    if (!supplied) throw new Error(`missing approved asset ${assetId}`);
    const sourcePath = path.resolve(supplied);
    if (!withinRoot(sourcePath, root)) throw new Error(`asset ${assetId} is outside the approved asset root`);
    const extension = path.extname(sourcePath).toLowerCase();
    const allowed = kind === "image" ? IMAGE_EXTENSIONS : VIDEO_EXTENSIONS;
    if (!allowed.has(extension)) throw new Error(`asset ${assetId} has an unsupported ${kind} extension`);
    return { assetId, sourcePath, publicPath: `assets/${assetId}${extension}`, kind };
  });
}

function styleProfile(profile: ReelStyleProfileV1, durationMs: number): StyleProfile {
  const [background = "#171717", foreground = "#f4f1eb", ...extra] = profile.palette;
  const accent = extra.length > 0 ? extra : [foreground];
  const split = profile.templateId === "split_explainer" || profile.templateId === "talking_half";
  return {
    schema_version: "axcas-1",
    typography: { primary_font: "Poppins", case: "mixed", size_scale: { headline: 80, body: 46, caption: 30 } },
    color: { background, primary: foreground, accent, text_on_bg: foreground, surface: "#ffffff", ink: background, caption_highlight: accent[0] },
    motion: { transition_style: "kinetic", easing: "spring", spring_params: { stiffness: 130, damping: 16 }, default_in_ms: 320 },
    layout: { aspect: "9:16", grid: "left-aligned", text_position: "top", archetype: split ? "split_explainer" : "centered", ...(split ? { face: { position: "bottom" as const, height_pct: 50 } } : {}) },
    pacing: { avg_segment_ms: Math.max(250, Math.round(durationMs / 3)) },
  };
}

function durationOf(layer: ReelStyleProfileV1["layers"][number]): number {
  return layer.endMs - layer.startMs;
}

export function buildOwnedTemplateRender(input: {
  profile: ReelStyleProfileV1;
  assetPaths: Record<string, string>;
  assetRoot: string;
  businessName: string;
  socialHandle?: string;
}): OwnedTemplateRender {
  const textLayers = input.profile.layers.filter((layer): layer is typeof layer & { text: string } => layer.kind === "text" && Boolean(layer.text)).sort((left, right) => left.startMs - right.startMs);
  if (textLayers.length === 0) throw new Error("reel profile requires at least one supplied text layer");
  const assets = collectAssets(input.profile, input.assetPaths, input.assetRoot);
  const primaryMedia = assets[0]?.publicPath;
  const durationMs = Math.max(...input.profile.layers.map((layer) => layer.endMs));
  const profile = styleProfile(input.profile, durationMs);
  const compositionId = AXCAS_REEL_COMPOSITIONS[input.profile.templateId];
  const base = { width: 1080 as const, height: 1920 as const, fps: 30 as const, durationMs, compositionId, assets };

  if (input.profile.templateId === "kinetic_type") {
    return { ...base, props: reelProps.parse({ profile, fps: 30, blocks: textLayers.map((layer, index) => ({ text: layer.text, emphasis: index === 1, duration_ms: durationOf(layer) })) }) };
  }
  if (input.profile.templateId === "split_explainer") {
    return { ...base, props: explainerProps.parse({ profile, fps: 30, speaker: { name: input.businessName, handle: input.socialHandle ?? "" }, blocks: textLayers.map((layer, index) => ({ spoken: layer.text, slide: { shot: primaryMedia ? (index === 1 ? "split" : "title") : "title", palette: index === 1 ? "paper" : "ink", headline: layer.text, ...(primaryMedia ? { media: primaryMedia } : {}) }, duration_ms: durationOf(layer) })) }) };
  }
  if (input.profile.templateId === "talking_half") {
    return { ...base, props: talkingHalfProps.parse({ profile, fps: 30, speaker: { name: input.businessName, handle: input.socialHandle ?? "" }, blocks: textLayers.map((layer, index) => ({ spoken: layer.text, visual: { kind: primaryMedia && index === 1 ? "broll" : "title", headline: layer.text, ...(primaryMedia ? { media: primaryMedia } : {}) }, duration_ms: durationOf(layer) })) }) };
  }
  if (input.profile.templateId === "full_infographic") {
    return { ...base, props: fullInfographicProps.parse({ profile, fps: 30, blocks: textLayers.map((layer, index) => index === 0 ? { kind: "title", title: layer.text, duration_ms: durationOf(layer) } : { kind: "quote", quote: layer.text, attribution: index === textLayers.length - 1 ? input.businessName : undefined, duration_ms: durationOf(layer) }) }) };
  }
  return { ...base, props: postHighlightProps.parse({ profile, fps: 30, post: { author: input.businessName, handle: input.socialHandle ?? "", text: textLayers.map((layer) => layer.text).join(" "), ...(assets.find((asset) => asset.kind === "image") ? { avatar: assets.find((asset) => asset.kind === "image")?.publicPath } : {}) }, blocks: textLayers.map((layer, index) => ({ highlight: layer.text, caption: index === 0 ? undefined : layer.text, duration_ms: durationOf(layer) })) }) };
}
