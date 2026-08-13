import { metaSignatureForTest } from "../../whatsapp-io/src/meta-webhook";

export type QualificationSquad = ReturnType<typeof buildQualificationSquad>;

export function buildQualificationSquad(input: { merchantName: string; productSummary: string }) {
  return {
    name: "ProofGate consented qualification",
    members: [
      {
        assistant: {
          name: "Recording consent",
          firstMessage: `Hello, this is an AI assistant calling for ${input.merchantName}. May I record this call while I ask about your interest? Please say yes or no.`,
          systemPrompt: "Ask only for explicit recording consent. On yes, transfer to the qualification assistant. On no, thank the person and end the call. Do not discuss the offer.",
          artifactPlan: { recordingEnabled: false, loggingEnabled: false, transcriptPlan: { enabled: false } },
        },
      },
      {
        assistant: {
          name: "Qualification",
          firstMessage: `Thank you. I am an AI assistant for ${input.merchantName}.`,
          systemPrompt: `You are an AI assistant qualifying an explicitly opted-in lead for ${input.productSummary}. Gather interest, timing, product preference, objections, and whether human follow-up is requested. Never take payment. Honor do-not-call immediately.`,
          artifactPlan: { recordingEnabled: true, loggingEnabled: true, transcriptPlan: { enabled: true, assistantName: "AI assistant", userName: "Lead" } },
        },
      },
    ],
  } as const;
}

export async function authenticateVapiWebhook(
  body: string,
  headers: { timestamp?: string | null; signature?: string | null },
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  const timestamp = headers.timestamp ?? "";
  if (!/^\d{10}$/.test(timestamp) || Math.abs(nowSeconds - Number(timestamp)) > 300) return false;
  const expected = await metaSignatureForTest(`${timestamp}.${body}`, secret);
  const actual = headers.signature ?? "";
  if (expected.length !== actual.length) return false;
  let result = 0;
  for (let index = 0; index < expected.length; index += 1) result |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return result === 0;
}
