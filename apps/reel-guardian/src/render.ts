import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { ReelPlanV1 } from "../../../packages/domain/src/growth";
import { synthesizeReelVoiceover } from "../../../packages/reels/src/polly";
import { inspectReel, renderReel } from "../../reel-worker/src/render";

export async function renderApprovedReel(plan: ReelPlanV1, assets: Record<string, Uint8Array>): Promise<Uint8Array> {
  const root = await mkdtemp(path.join(tmpdir(), "axcas-guardian-"));
  try {
    const paths: Record<string, string> = {};
    for (const [assetId, bytes] of Object.entries(assets)) {
      const file = path.join(root, `${assetId}.jpg`);
      await writeFile(file, bytes);
      paths[assetId] = file;
    }
    const voice = await synthesizeReelVoiceover({ text: plan.voiceover, region: process.env.AWS_REGION ?? "ap-south-1" });
    const voicePath = path.join(root, "voice.mp3");
    const outputPath = path.join(root, `${plan.reelId}.mp4`);
    await writeFile(voicePath, voice.audio);
    await renderReel({ plan, assetPaths: paths, assetRoot: root, outputPath, voiceoverPath: voicePath });
    const probe = await inspectReel(outputPath);
    if (probe.width !== 1080 || probe.height !== 1920 || probe.videoCodec !== "h264" || probe.audioCodec !== "aac" || probe.durationSeconds < 12 || probe.durationSeconds > 18) throw new Error("render verification failed");
    return new Uint8Array(await readFile(outputPath));
  } finally { await rm(root, { recursive: true, force: true }); }
}
