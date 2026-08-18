type ApprovalTap = { approvalId: string; decision: "approved" | "denied"; senderWaId: string; providerMessageId: string };
export type StudioLinkMessage = { code: string; senderWaId: string; providerMessageId: string };

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hmacHex(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

export async function metaSignatureForTest(body: string, secret: string): Promise<string> {
  return `sha256=${await hmacHex(body, secret)}`;
}

export async function verifyMetaWebhookSignature(body: string, signature: string | null | undefined, secret: string): Promise<boolean> {
  if (!signature?.startsWith("sha256=") || !secret) return false;
  const expected = await metaSignatureForTest(body, secret);
  return constantTimeEqual(expected, signature);
}

export function extractProofGateApproval(payload: unknown): ApprovalTap | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as { entry?: Array<{ changes?: Array<{ value?: { messages?: Array<Record<string, unknown>> } }> }> };
  for (const entry of root.entry ?? []) for (const change of entry.changes ?? []) for (const message of change.value?.messages ?? []) {
    const interactive = message.interactive as { button_reply?: { id?: string }; list_reply?: { id?: string } } | undefined;
    const id = interactive?.button_reply?.id ?? interactive?.list_reply?.id;
    const match = /^pg:([a-z0-9-]{3,64}):(approve|deny)$/.exec(id ?? "");
    if (!match || typeof message.from !== "string" || typeof message.id !== "string") continue;
    return { approvalId: match[1], decision: match[2] === "approve" ? "approved" : "denied", senderWaId: message.from, providerMessageId: message.id };
  }
  return null;
}

export function extractStudioLinkMessage(payload: unknown): StudioLinkMessage | null {
  if (!payload || typeof payload !== "object") return null;
  const entries = (payload as { entry?: unknown }).entry;
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    const changes = (entry as { changes?: unknown })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const messages = (change as { value?: { messages?: unknown } })?.value?.messages;
      if (!Array.isArray(messages)) continue;
      for (const message of messages) {
        const value = message as { from?: unknown; id?: unknown; type?: unknown; text?: { body?: unknown } };
        if (value.type !== "text" || typeof value.from !== "string" || typeof value.id !== "string" || typeof value.text?.body !== "string") continue;
        const match = /^\s*AXCAS\s+LINK\s+([A-Z0-9]{6,10})\s*$/i.exec(value.text.body);
        if (match) return { code: match[1].toUpperCase(), senderWaId: value.from, providerMessageId: value.id };
      }
    }
  }
  return null;
}
