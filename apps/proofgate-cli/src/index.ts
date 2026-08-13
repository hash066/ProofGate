import { readFile } from "node:fs/promises";

import { prepareAssetCommand, prepareJsonCommand, prepareReelDeliveryCommand, submitCommand } from "./commands";

function usage(): never {
  throw new Error("Usage: proofgate <intake|candidate|verification|release|lead|batch|reel|policy|decision|social-campaign> <json-file> [--submit] | proofgate asset <asset-id> <merchant-id> <source-message-id> <content-type> <file> [--submit] | proofgate deliver-reel <reel-id> <asset-id> <recipient-wa-id> [caption] --submit | proofgate metrics <site-id> [days] | proofgate guardian <calls|reel|release>");
}

async function authenticatedRequest(path: string, init?: RequestInit): Promise<unknown> {
  const baseUrl = process.env.PROOFGATE_ADMIN_URL;
  const secret = process.env.PROOFGATE_SERVICE_SECRET;
  if (!baseUrl || !secret) throw new Error("PROOFGATE_ADMIN_URL and PROOFGATE_SERVICE_SECRET are required");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers: { authorization: `Bearer ${secret}`, "content-type": "application/json", ...init?.headers } });
  const text = await response.text();
  if (!response.ok) throw new Error(`ProofGate request failed (${response.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : { ok: true };
}

async function main() {
  const [, , command, ...args] = process.argv;
  if (!command) usage();
  if (command === "guardian") {
    if (args[0] !== "calls" && args[0] !== "reel" && args[0] !== "release") usage();
    process.stdout.write(`${JSON.stringify(await authenticatedRequest("/internal/guardian", { method: "POST", body: JSON.stringify({ kind: args[0] }) }))}\n`);
    return;
  }
  if (command === "metrics") {
    const siteId = args[0];
    const days = Number(args[1] ?? "7");
    if (!siteId || !Number.isFinite(days) || days <= 0) usage();
    process.stdout.write(`${JSON.stringify(await authenticatedRequest(`/internal/metrics/${encodeURIComponent(siteId)}?since=${Date.now() - days * 86_400_000}`))}\n`);
    return;
  }
  let prepared;
  if (command === "asset") {
    if (args.length < 5) usage();
    prepared = await prepareAssetCommand({ assetId: args[0], merchantId: args[1], sourceProviderMessageId: args[2], contentType: args[3], filePath: args[4] });
  } else if (command === "deliver-reel") {
    if (args.length < 3) usage();
    prepared = prepareReelDeliveryCommand({ reelId: args[0], renderedAssetId: args[1], recipientWaId: args[2], caption: args[3] });
  } else {
    if (!(["intake", "candidate", "verification", "release", "lead", "batch", "reel", "policy", "decision", "social-campaign"] as string[]).includes(command) || !args[0]) usage();
    prepared = await prepareJsonCommand(command as "intake" | "candidate" | "verification" | "release" | "lead" | "batch" | "reel" | "policy" | "decision" | "social-campaign", JSON.parse(await readFile(args[0], "utf8")));
  }
  if (!args.includes("--submit")) {
    process.stdout.write(`${JSON.stringify({ valid: true, path: prepared.path, method: prepared.method, bytes: typeof prepared.body === "string" ? Buffer.byteLength(prepared.body) : prepared.body.byteLength })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(await submitCommand(prepared))}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
