import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { ReelStyleProfileSchema } from "../../../packages/domain/src/studio";
import { buildOwnedTemplateRender } from "./axcas-adapter";

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = path.resolve(appRoot, "../..");

type RenderRequest = {
  profile: unknown;
  assetRoot: string;
  assetPaths: Record<string, string>;
  businessName: string;
  socialHandle?: string;
  voiceoverPath?: string;
  outputPath: string;
};

function assertInsideRoot(candidate: string, root: string, label: string): string {
  const resolved = path.resolve(candidate);
  const relative = path.relative(path.resolve(root), resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error(`${label} is outside the approved asset root`);
  return resolved;
}

export async function renderOwnedTemplate(request: RenderRequest): Promise<{ outputPath: string; compositionId: string; durationMs: number }> {
  const profile = ReelStyleProfileSchema.parse(request.profile);
  const render = buildOwnedTemplateRender({ profile, assetRoot: request.assetRoot, assetPaths: request.assetPaths, businessName: request.businessName, socialHandle: request.socialHandle });
  const outputPath = path.resolve(request.outputPath);
  await mkdir(path.dirname(outputPath), { recursive: true });
  const working = await mkdtemp(path.join(tmpdir(), "axcas-remotion-"));
  try {
    const publicDir = path.join(working, "public");
    await mkdir(path.join(publicDir, "assets"), { recursive: true });
    for (const asset of render.assets) await copyFile(asset.sourcePath, path.join(publicDir, ...asset.publicPath.split("/")));
    const propsFile = path.join(working, "props.json");
    const silentVideo = path.join(working, "silent.mp4");
    await writeFile(propsFile, JSON.stringify(render.props), "utf8");

    const remotionCli = path.join(repositoryRoot, "node_modules", "@remotion", "cli", "remotion-cli.js");
    const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE;
    await execFileAsync(process.execPath, [
      remotionCli,
      "render",
      path.join(appRoot, "src", "index.ts"),
      render.compositionId,
      silentVideo,
      `--props=${propsFile}`,
      `--public-dir=${publicDir}`,
      "--codec=h264",
      "--pixel-format=yuv420p",
      "--overwrite",
      "--concurrency=1",
      "--log=warn",
      ...(browserExecutable ? [`--browser-executable=${browserExecutable}`] : []),
    ], { cwd: appRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });

    const audioArgs = request.voiceoverPath
      ? ["-i", assertInsideRoot(request.voiceoverPath, request.assetRoot, "voiceover")]
      : ["-f", "lavfi", "-t", String(render.durationMs / 1000), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"];
    await execFileAsync("ffmpeg", [
      "-y", "-i", silentVideo, ...audioArgs,
      "-map", "0:v:0", "-map", "1:a:0", "-t", String(render.durationMs / 1000),
      "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", outputPath,
    ], { cwd: appRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    return { outputPath, compositionId: render.compositionId, durationMs: render.durationMs };
  } finally {
    await rm(working, { recursive: true, force: true });
  }
}

async function main(): Promise<void> {
  const requestPath = process.argv[2];
  if (!requestPath) throw new Error("usage: npm run reel:template:render -- <render-request.json>");
  const request = JSON.parse(await readFile(path.resolve(requestPath), "utf8")) as RenderRequest;
  process.stdout.write(`${JSON.stringify(await renderOwnedTemplate(request))}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
