import { readFile } from "node:fs/promises";

import { LeadConsentSchema, ReelPlanSchema, SiteSpecV2Schema } from "../../../packages/domain/src/growth";
import { DecisionPolicySchema, DecisionRequestSchema } from "../../../packages/domain/src/decision-policy";
import { StudioIntakeInputSchema } from "../../../packages/domain/src/studio";
import { createCallBatch } from "../../../packages/release-policy/src/growth-policy";
import { createSocialCampaign } from "../../../packages/social/src/experiment";

export type PreparedCommand = { path: string; method: "GET" | "POST" | "PUT"; body?: string | Uint8Array; contentType: string; extraHeaders?: Record<string, string> };

export function prepareReelDeliveryCommand(input: { reelId: string; renderedAssetId: string; recipientWaId: string; caption?: string }): PreparedCommand {
  if (!/^[a-zA-Z0-9_-]{3,128}$/.test(input.reelId) || !/^[a-zA-Z0-9_-]{3,128}$/.test(input.renderedAssetId)) throw new Error("reel delivery scope is invalid");
  if (!/^\d{8,15}$/.test(input.recipientWaId)) throw new Error("reel recipient is invalid");
  if ((input.caption?.length ?? 0) > 1024) throw new Error("reel caption is too long");
  return { path: "/internal/reel-delivery", method: "POST", body: JSON.stringify(input), contentType: "application/json" };
}

export async function prepareJsonCommand(command: "intake" | "candidate" | "verification" | "release" | "lead" | "batch" | "reel" | "policy" | "decision" | "social-campaign", payload: unknown): Promise<PreparedCommand> {
  if (command === "policy") return { path: "/internal/policy", method: "POST", body: JSON.stringify(DecisionPolicySchema.parse(payload)), contentType: "application/json" };
  if (command === "decision") return { path: "/internal/decision", method: "POST", body: JSON.stringify(DecisionRequestSchema.parse(payload)), contentType: "application/json" };
  if (command === "intake") return { path: "/internal/intake", method: "POST", body: JSON.stringify(StudioIntakeInputSchema.parse(payload)), contentType: "application/json" };
  if (command === "candidate") {
    const value = payload as { spec?: unknown; versionId?: unknown; parentVersionId?: unknown };
    if (typeof value?.versionId !== "string" || !/^[a-zA-Z0-9_-]{3,128}$/.test(value.versionId)) throw new Error("candidate versionId is invalid");
    return { path: "/internal/candidate", method: "POST", body: JSON.stringify({ versionId: value.versionId, parentVersionId: typeof value.parentVersionId === "string" ? value.parentVersionId : undefined, spec: SiteSpecV2Schema.parse(value.spec) }), contentType: "application/json" };
  }
  if (command === "lead") {
    const value = payload as { merchantId?: unknown; consent?: unknown };
    if (typeof value?.merchantId !== "string") throw new Error("lead merchantId is required");
    return { path: "/internal/lead", method: "POST", body: JSON.stringify({ merchantId: value.merchantId, consent: LeadConsentSchema.parse(value.consent) }), contentType: "application/json" };
  }
  if (command === "verification" || command === "release") {
    const value = payload as { siteId?: unknown; merchantId?: unknown; versionId?: unknown; specHash?: unknown };
    if (typeof value.siteId !== "string" || typeof value.versionId !== "string" || typeof value.specHash !== "string" || !/^[a-f0-9]{64}$/.test(value.specHash)) throw new Error(`${command} candidate scope is invalid`);
    if (command === "release" && typeof value.merchantId !== "string") throw new Error("release merchantId is required");
    return { path: command === "verification" ? "/internal/verification-capability" : "/internal/release", method: "POST", body: JSON.stringify(value), contentType: "application/json" };
  }
  if (command === "batch") {
    const batch = await createCallBatch(payload as Parameters<typeof createCallBatch>[0]);
    return { path: "/internal/call-batch", method: "POST", body: JSON.stringify(batch), contentType: "application/json" };
  }
  if (command === "social-campaign") {
    const campaign = await createSocialCampaign(payload as Parameters<typeof createSocialCampaign>[0]);
    return { path: "/internal/social-campaign", method: "POST", body: JSON.stringify(campaign), contentType: "application/json" };
  }
  const plan = ReelPlanSchema.parse(payload);
  return { path: "/internal/reel", method: "POST", body: JSON.stringify(plan), contentType: "application/json" };
}

export async function prepareAssetCommand(input: { assetId: string; merchantId: string; sourceProviderMessageId: string; filePath: string; contentType: string }): Promise<PreparedCommand> {
  if (!/^[a-zA-Z0-9_-]{3,128}$/.test(input.assetId)) throw new Error("assetId is invalid");
  if (!/^[a-z0-9-]{3,64}$/.test(input.merchantId)) throw new Error("merchantId is invalid");
  const body = new Uint8Array(await readFile(input.filePath));
  if (body.byteLength === 0 || body.byteLength > 20 * 1024 * 1024) throw new Error("asset must be between 1 byte and 20MB");
  return {
    path: `/internal/assets/${input.assetId}`,
    method: "PUT",
    body,
    contentType: input.contentType,
    extraHeaders: { "x-proofgate-merchant-id": input.merchantId, "x-proofgate-source-message-id": input.sourceProviderMessageId },
  };
}

export async function submitCommand(command: PreparedCommand, env: NodeJS.ProcessEnv = process.env): Promise<unknown> {
  const baseUrl = env.PROOFGATE_ADMIN_URL;
  const secret = env.PROOFGATE_SERVICE_SECRET;
  if (!baseUrl || !secret) throw new Error("PROOFGATE_ADMIN_URL and PROOFGATE_SERVICE_SECRET are required");
  const requestBody: BodyInit | undefined = typeof command.body === "string"
    ? command.body
    : command.body
      ? new Uint8Array(Array.from(command.body)).buffer
      : undefined;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${command.path}`, {
    method: command.method,
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": command.contentType,
      "x-hermes-platform": env.HERMES_SESSION_PLATFORM ?? "cli",
      "x-hermes-user-id": env.HERMES_SESSION_USER_ID ?? "",
      "x-hermes-message-id": env.HERMES_SESSION_MESSAGE_ID ?? "",
      ...command.extraHeaders,
    },
    body: command.method === "GET" ? undefined : requestBody,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`ProofGate admin request failed (${response.status}): ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : { ok: true };
}
