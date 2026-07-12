import { execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { ConvexHttpClient } from "convex/browser";

import { api } from "../../../convex/_generated/api";
import { sendTelegramMessage, telegramChatIdFromTarget } from "../../../packages/hermes-io/src/telegram";
import { signBookingSession, type BookingSession } from "../../../packages/release-policy/src/external-oracle";
import { convexCliInvocation } from "./convex-cli";
import { buildSpikeBMessage } from "./message";
import { resolveWorkerBaseUrl } from "./worker-url";

const execFileAsync = promisify(execFile);

function argument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value || value.startsWith("--")) throw new Error(`Missing required ${name}`);
  return value;
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function loadLocalEnvironment(): Promise<Record<string, string>> {
  const content = await readFile(".env.local", "utf8");
  const environment: Record<string, string> = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...parts] = trimmed.split("=");
    environment[key] = parts.join("=").replace(/^['"]|['"]$/g, "");
  }
  return environment;
}

async function runConvex(functionName: string, args: unknown): Promise<unknown> {
  const invocation = convexCliInvocation(process.cwd(), functionName, args);
  const { stdout } = await execFileAsync(
    invocation.executable,
    invocation.args,
    {
      windowsHide: true,
      encoding: "utf8",
    },
  );
  return JSON.parse(stdout);
}

async function main(): Promise<void> {
  const target = argument("--target");
  const actor = argument("--actor");
  const consentReceipt = argument("--consent-receipt");
  if (!/^telegram:[^\s]+$/.test(target)) throw new Error("--target must be an explicit Telegram target");
  if (actor !== "external-merchant" && actor !== "external-buyer") {
    throw new Error("--actor must be external-merchant or external-buyer");
  }

  const localEnvironment = await loadLocalEnvironment();
  const workerBaseUrl = resolveWorkerBaseUrl(
    process.env.PROOFGATE_WORKER_URL ?? localEnvironment.PROOFGATE_WORKER_URL,
  );
  const secret = localEnvironment.BOOKING_SESSION_SECRET;
  const convexUrl = localEnvironment.CONVEX_URL ?? "https://vivid-warthog-67.eu-west-1.convex.cloud";
  if (!secret) throw new Error("BOOKING_SESSION_SECRET is missing from .env.local");

  const publicPage = await fetch(`${workerBaseUrl}/s/saturday-sessions`, { redirect: "error" });
  if (!publicPage.ok) throw new Error(`Public Worker returned HTTP ${publicPage.status}`);
  const specHash = publicPage.headers.get("x-proofgate-spec-hash");
  if (!specHash || !/^[a-f0-9]{64}$/.test(specHash)) throw new Error("Public Worker did not return an immutable SiteSpec hash");

  const issuedAt = Date.now();
  const runId = `spike-b-${new Date(issuedAt).toISOString().replace(/[-:.TZ]/g, "")}-${randomUUID().slice(0, 8)}`;
  const recipientIdentityHash = hash(telegramChatIdFromTarget(target));
  const nonce = randomBytes(24).toString("base64url");
  const nonceHash = hash(nonce);
  const session: BookingSession = {
    schemaVersion: 1,
    nonce,
    correlationNonceHash: nonceHash,
    siteId: "saturday-sessions",
    versionId: "spike-a-v1",
    specHash,
    contractId: "spike-b-two-seat-external-ack-v1",
    runId,
    action: "booking",
    expectedQuantity: 2,
    csrfIdentityHash: recipientIdentityHash,
    issuedAt,
    expiresAt: issuedAt + 24 * 60 * 60 * 1000,
  };
  const token = await signBookingSession(session, secret);
  const artifactPath = `evidence/spike-b/${runId}.json`;
  await mkdir("evidence/spike-b", { recursive: true });

  const artifact: Record<string, unknown> = {
    evidenceCategory: "development-spike-b",
    countsAsFinalEvidence: false,
    runId,
    siteId: session.siteId,
    versionId: session.versionId,
    specHash: session.specHash,
    contractId: session.contractId,
    expectedQuantity: session.expectedQuantity,
    actorClass: actor,
    actorEligibilityAssertion: "Operator asserted this recipient is outside the builder/team and consented to this development acknowledgment request.",
    consentReceipt,
    recipientIdentityHash,
    correlationNonceHash: nonceHash,
    issuedAt,
    expiresAt: session.expiresAt,
    publicWorkerUrl: workerBaseUrl,
    state: "preparing",
  };
  const persist = async () => writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
  await persist();
  const convex = new ConvexHttpClient(convexUrl);

  try {
    await runConvex("oracle:createSpikeBSubject", {
      nonceHash,
      siteId: session.siteId,
      versionId: session.versionId,
      specHash: session.specHash,
      contractId: session.contractId,
      runId: session.runId,
      expectedQuantity: session.expectedQuantity,
      csrfIdentityHash: session.csrfIdentityHash,
      issuedAt: session.issuedAt,
      expiresAt: session.expiresAt,
    });
    artifact.state = "session-issued";
    await persist();

    const submission = await convex.action(api.oracle.submitBooking, { token });
    if (submission.runId !== session.runId) throw new Error("Convex submission returned the wrong run binding");
    artifact.state = "submitted";
    await persist();

    const acknowledgmentUrl = `${workerBaseUrl}/ack?token=${encodeURIComponent(token)}`;
    const message = buildSpikeBMessage(acknowledgmentUrl);
    const receipt = await sendTelegramMessage(target, message);
    artifact.telegramReceipt = {
      platform: receipt.platform,
      chatIdentityHash: hash(receipt.chatId),
      providerMessageId: receipt.messageId,
      mirrored: receipt.mirrored,
    };
    artifact.state = "provider-dispatched";
    await persist();

    const dispatchPayloadHash = hash(message);
    await runConvex("oracle:appendVerifiedEvent", {
      providerEventId: `telegram:${receipt.chatId}:${receipt.messageId}`,
      provider: "telegram",
      level: "dispatched",
      siteId: session.siteId,
      versionId: session.versionId,
      specHash: session.specHash,
      contractId: session.contractId,
      runId: session.runId,
      correlationNonceHash: nonceHash,
      quantity: session.expectedQuantity,
      verificationMethod: "provider_signature",
      actorClass: "system",
      verifiedAt: Date.now(),
      verifierIdentity: recipientIdentityHash,
      environment: "development_spike",
      redactedPayload: "Telegram development booking request with signed acknowledgment capability",
      payloadHash: dispatchPayloadHash,
      occurredAt: Date.now(),
    });
    const projection = await convex.query(api.oracle.getPassportProjection, { siteId: session.siteId });
    artifact.state = "external-acknowledgment-pending";
    artifact.passportProjection = projection;
    artifact.completedAt = Date.now();
    await persist();
    process.stdout.write(`${JSON.stringify({ runId, artifactPath, state: artifact.state })}\n`);
  } catch (error) {
    artifact.state = "failed";
    artifact.failure = error instanceof Error ? error.message : String(error);
    artifact.failedAt = Date.now();
    await persist();
    throw error;
  }
}

await main();
