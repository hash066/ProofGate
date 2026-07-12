import { z } from "zod";

export const BookingSessionSchema = z.object({
  schemaVersion: z.literal(1),
  nonce: z.string().min(16).max(128),
  correlationNonceHash: z.string().regex(/^[a-f0-9]{64}$/),
  siteId: z.string().min(3),
  versionId: z.string().min(3),
  specHash: z.string().regex(/^[a-f0-9]{64}$/),
  contractId: z.string().min(3),
  runId: z.string().min(3),
  action: z.literal("booking"),
  expectedQuantity: z.number().int().min(1).max(50),
  csrfIdentityHash: z.string().regex(/^[a-f0-9]{64}$/),
  issuedAt: z.number().int().positive(),
  expiresAt: z.number().int().positive(),
});

export type BookingSession = z.infer<typeof BookingSessionSchema>;

export const BookingEventSchema = z.object({
  eventId: z.string().min(3),
  provider: z.enum(["proofgate-edge", "telegram", "dodo"]),
  level: z.enum(["submitted", "dispatched", "acknowledged"]),
  siteId: z.string(),
  versionId: z.string(),
  specHash: z.string().regex(/^[a-f0-9]{64}$/),
  contractId: z.string(),
  runId: z.string(),
  correlationNonceHash: z.string().regex(/^[a-f0-9]{64}$/),
  quantity: z.number().int().min(1),
  verificationMethod: z.enum(["provider_signature", "edge_hmac", "merchant_ack", "buyer_ack"]),
  actorClass: z.enum(["external_human", "system", "team", "test", "synthetic_verifier"]),
  verifierIdentity: z.string().min(3).max(256),
  occurredAt: z.number().int().positive(),
});

export type BookingEvent = z.infer<typeof BookingEventSchema>;

type OracleResult = {
  externalWitnessSatisfied: boolean;
  passportState: "amber" | "green";
  reason: "EXTERNAL_ACKNOWLEDGMENT_PENDING" | "EXACT_EXTERNAL_ACKNOWLEDGMENT";
};

function matchesSession(session: BookingSession, event: BookingEvent): boolean {
  return (
    event.siteId === session.siteId &&
    event.versionId === session.versionId &&
    event.specHash === session.specHash &&
    event.contractId === session.contractId &&
    event.runId === session.runId &&
    event.correlationNonceHash === session.correlationNonceHash &&
    event.quantity === session.expectedQuantity &&
    event.occurredAt >= session.issuedAt &&
    event.occurredAt <= session.expiresAt
  );
}

export function deriveOracleState(sessionInput: BookingSession, eventInputs: BookingEvent[]): OracleResult {
  const predicates = evaluateOraclePredicates(sessionInput, eventInputs);

  if (predicates.submitted && predicates.dispatched && predicates.acknowledged) {
    return { externalWitnessSatisfied: true, passportState: "green", reason: "EXACT_EXTERNAL_ACKNOWLEDGMENT" };
  }
  return { externalWitnessSatisfied: false, passportState: "amber", reason: "EXTERNAL_ACKNOWLEDGMENT_PENDING" };
}

export function evaluateOraclePredicates(
  sessionInput: BookingSession,
  eventInputs: BookingEvent[],
): { submitted: boolean; dispatched: boolean; acknowledged: boolean } {
  const session = BookingSessionSchema.parse(sessionInput);
  const events = eventInputs.map((event) => BookingEventSchema.parse(event));
  const submitted = events.some(
    (event) =>
      event.level === "submitted" &&
      event.provider === "proofgate-edge" &&
      event.verificationMethod === "edge_hmac" &&
      event.actorClass === "system" &&
      matchesSession(session, event),
  );
  const dispatched = events.some(
    (event) =>
      event.level === "dispatched" &&
      event.provider === "telegram" &&
      event.verificationMethod === "provider_signature" &&
      event.actorClass === "system" &&
      event.verifierIdentity === session.csrfIdentityHash &&
      matchesSession(session, event),
  );
  const acknowledged = events.some(
    (event) =>
      event.level === "acknowledged" &&
      event.actorClass === "external_human" &&
      (event.verificationMethod === "merchant_ack" || event.verificationMethod === "buyer_ack") &&
      event.verifierIdentity === session.csrfIdentityHash &&
      matchesSession(session, event),
  );

  return { submitted, dispatched, acknowledged };
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) throw new Error("booking-session signing secret must contain at least 32 characters");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function assertNonceHash(session: BookingSession): Promise<void> {
  if ((await sha256Hex(session.nonce)) !== session.correlationNonceHash) {
    throw new Error("booking-session nonce hash does not match the signed nonce");
  }
}

export async function signBookingSession(sessionInput: BookingSession, secret: string): Promise<string> {
  const session = BookingSessionSchema.parse(sessionInput);
  if (session.expiresAt <= session.issuedAt) throw new Error("booking session must expire after issuance");
  await assertNonceHash(session);
  const payload = new TextEncoder().encode(JSON.stringify(session));
  const signature = await crypto.subtle.sign("HMAC", await importHmacKey(secret), payload);
  return `${toBase64Url(payload)}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyBookingSession(token: string, secret: string, now = Date.now()): Promise<BookingSession> {
  const [payloadPart, signaturePart, extra] = token.split(".");
  if (!payloadPart || !signaturePart || extra) throw new Error("invalid booking-session token shape");
  const payload = fromBase64Url(payloadPart);
  const signature = fromBase64Url(signaturePart);
  const valid = await crypto.subtle.verify("HMAC", await importHmacKey(secret), signature, payload);
  if (!valid) throw new Error("invalid booking-session signature");
  const session = BookingSessionSchema.parse(JSON.parse(new TextDecoder().decode(payload)));
  await assertNonceHash(session);
  if (now < session.issuedAt) throw new Error("booking-session token is not yet valid");
  if (now > session.expiresAt) throw new Error("booking-session token expired");
  return session;
}

export type VerifiedBookingSubmission = {
  session: BookingSession;
  nonceHash: string;
  providerEventId: string;
  payloadHash: string;
  occurredAt: number;
};

export async function verifySignedBookingSubmission(
  token: string,
  secret: string,
  now = Date.now(),
): Promise<VerifiedBookingSubmission> {
  const session = await verifyBookingSession(token, secret, now);
  const payloadHash = await sha256Hex(`submitted:${token}`);
  return {
    session,
    nonceHash: session.correlationNonceHash,
    providerEventId: `submitted:${payloadHash}`,
    payloadHash,
    occurredAt: now,
  };
}
