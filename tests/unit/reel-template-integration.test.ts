import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  AXCAS_REEL_COMPOSITIONS,
  OWNER_TEMPLATE_SOURCE,
  buildOwnedTemplateRender,
} from "../../apps/reel-template-worker/src/axcas-adapter";
import type { ReelStyleProfileV1 } from "../../packages/domain/src/studio";

const profile: ReelStyleProfileV1 = {
  schemaVersion: 1,
  profileId: "profile-golden-crust",
  merchantId: "golden-crust",
  name: "Golden Crust launch",
  templateId: "split_explainer",
  referenceAssetIds: ["bread-photo-1", "founder-video-1"],
  palette: ["#171717", "#f4f1eb", "#fe5b3a"],
  layers: [
    { id: "hook-layer", kind: "text", text: "Hubli sourdough, baked tomorrow", startMs: 0, endMs: 4500, x: 0.05, y: 0.05, width: 0.9, height: 0.2 },
    { id: "proof-layer", kind: "text", text: "Real fermented loaves from Golden Crust", startMs: 4500, endMs: 10_000, x: 0.05, y: 0.25, width: 0.9, height: 0.2 },
    { id: "media-layer", kind: "video", sourceAssetId: "founder-video-1", startMs: 0, endMs: 10_000, x: 0, y: 0.5, width: 1, height: 0.5 },
    { id: "cta-layer", kind: "text", text: "Message Golden Crust", startMs: 10_000, endMs: 15_000, x: 0.05, y: 0.75, width: 0.9, height: 0.2 },
  ],
};

describe("owner-authorized KumarKindaTemplates integration", () => {
  it("maps all five Axcas reel formats to real vertical Remotion compositions", () => {
    expect(AXCAS_REEL_COMPOSITIONS).toEqual({
      kinetic_type: "InfographicReel",
      split_explainer: "SplitExplainerReel",
      talking_half: "TalkingHalfReel",
      full_infographic: "FullInfographicReel",
      post_highlight: "PostHighlightReel",
    });
  });

  it("pins source provenance to the exact owner repository commit", () => {
    expect(OWNER_TEMPLATE_SOURCE).toEqual({
      repository: "https://github.com/gdpranavl/YouLeft_KumarKindaTemplates",
      commit: "ed8d037f7b35e0cc971521801df07e0edf69828c",
      authorization: "repository_owner",
    });
  });

  it("builds validated Remotion props using only selected private assets", () => {
    const assetRoot = path.resolve("tmp", "merchant-assets");
    const render = buildOwnedTemplateRender({
      profile,
      assetRoot,
      assetPaths: {
        "bread-photo-1": path.join(assetRoot, "bread.jpg"),
        "founder-video-1": path.join(assetRoot, "founder.mp4"),
      },
      businessName: "Golden Crust Hubli",
      socialHandle: "@goldencrusthubli",
    });

    expect(render.compositionId).toBe("SplitExplainerReel");
    expect(render.width).toBe(1080);
    expect(render.height).toBe(1920);
    expect(render.fps).toBe(30);
    expect(render.durationMs).toBe(15_000);
    expect(render.assets).toEqual([
      expect.objectContaining({ assetId: "founder-video-1", publicPath: "assets/founder-video-1.mp4" }),
    ]);
    expect(JSON.stringify(render.props)).toContain("assets/founder-video-1.mp4");
    expect(JSON.stringify(render.props)).not.toContain(assetRoot);
  });

  it("rejects unselected, missing, and path-traversing media", () => {
    const assetRoot = path.resolve("tmp", "merchant-assets");
    const outside = path.resolve("tmp", "outside.mp4");
    expect(() => buildOwnedTemplateRender({
      profile: { ...profile, layers: [...profile.layers, { id: "bad-layer", kind: "video", sourceAssetId: "unselected-asset", startMs: 0, endMs: 1000, x: 0, y: 0, width: 1, height: 1 }] },
      assetRoot,
      assetPaths: { "unselected-asset": outside },
      businessName: "Golden Crust",
    })).toThrow(/selected reference/i);
    expect(() => buildOwnedTemplateRender({ profile, assetRoot, assetPaths: {}, businessName: "Golden Crust" })).toThrow(/missing approved asset/i);
    expect(() => buildOwnedTemplateRender({ profile, assetRoot, assetPaths: { "founder-video-1": outside }, businessName: "Golden Crust" })).toThrow(/approved asset root/i);
  });
});
