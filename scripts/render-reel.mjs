import { readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { ReelPlanSchema } from "../packages/domain/src/growth.ts";
import { synthesizeReelVoiceover } from "../packages/reels/src/polly.ts";
import { inspectReel, renderReel } from "../apps/reel-worker/src/render.ts";

const [planFile, assetMapFile, assetRoot, outputFile] = process.argv.slice(2);
if (!planFile || !assetMapFile || !assetRoot || !outputFile) {
  throw new Error("Usage: npm run reel:render -- <plan.json> <asset-map.json> <asset-root> <output.mp4>");
}

const plan = ReelPlanSchema.parse(JSON.parse(await readFile(planFile, "utf8")));
const assetPaths = JSON.parse(await readFile(assetMapFile, "utf8"));
const voicePath = path.resolve(`${outputFile}.voice.mp3`);
try {
  const voice = await synthesizeReelVoiceover({ text: plan.voiceover, region: process.env.AWS_REGION ?? "ap-south-1" });
  await writeFile(voicePath, voice.audio);
  await renderReel({ plan, assetPaths, assetRoot, outputPath: outputFile, voiceoverPath: voicePath });
  const probe = await inspectReel(outputFile);
  if (probe.width !== 1080 || probe.height !== 1920 || probe.videoCodec !== "h264" || probe.audioCodec !== "aac" || probe.durationSeconds < 12 || probe.durationSeconds > 18) {
    throw new Error(`render verification failed: ${JSON.stringify(probe)}`);
  }
  process.stdout.write(`${JSON.stringify({ rendered: true, outputPath: path.resolve(outputFile), voice: voice.voiceId, probe })}\n`);
} finally {
  await rm(voicePath, { force: true });
}
