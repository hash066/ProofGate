import { z } from "zod";

const SAFE_ERROR = "Merchant media boundary is unavailable";
const SHA256 = /^[a-f0-9]{64}$/;
const MERCHANT_ID = /^[a-z0-9-]{3,64}$/;
const ASSET_ID = /^[A-Za-z0-9_-]{3,128}$/;
const CAPABILITY_ID = /^[a-f0-9]{8}-[a-f0-9-]{27}$/;

const ContentTypeSchema = z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "audio/mpeg", "audio/ogg"]);
const IssueInputSchema = z.object({
  schemaVersion: z.literal(1),
  merchantId: z.string().regex(MERCHANT_ID),
  assetId: z.string().regex(ASSET_ID),
  sha256: z.string().regex(SHA256),
  byteLength: z.number().int().positive().max(100 * 1024 * 1024),
  contentType: ContentTypeSchema,
  sourceProviderMessageId: z.string().min(3).max(256),
}).strict();

const FinalizeInputSchema = z.object({
  schemaVersion: z.literal(1),
  merchantId: z.string().regex(MERCHANT_ID),
  assetId: z.string().regex(ASSET_ID),
  capabilityId: z.string().regex(CAPABILITY_ID),
}).strict();

const RegistrationSchema = z.object({
  status: z.literal("registered"),
  storageBackend: z.literal("s3"),
  assetId: z.string().regex(ASSET_ID),
  merchantId: z.string().regex(MERCHANT_ID),
  objectKey: z.string().min(1).max(512),
  sha256: z.string().regex(SHA256),
  byteLength: z.number().int().positive().max(100 * 1024 * 1024),
  contentType: ContentTypeSchema,
  sourceProviderMessageId: z.string().min(3).max(256),
}).strict().superRefine((value, context) => {
  if (value.objectKey !== `private/ingest/${value.merchantId}/${value.assetId}/${value.sha256}`) {
    context.addIssue({ code: "custom", message: "registration scope mismatch" });
  }
});

const UploadReadySchema = z.object({
  status: z.literal("upload_ready"),
  capabilityId: z.string().regex(CAPABILITY_ID),
  expiresAt: z.number().int().positive(),
  expiresInSeconds: z.number().int().min(1).max(300),
  uploadUrl: z.string().url(),
  requiredByteLength: z.number().int().positive().max(100 * 1024 * 1024),
  requiredHeaders: z.object({
    "content-type": ContentTypeSchema,
    "x-amz-checksum-sha256": z.string().min(1).max(128),
    "x-amz-server-side-encryption": z.literal("AES256"),
  }).strict(),
}).strict().superRefine((value, context) => {
  const url = new URL(value.uploadUrl);
  if (url.protocol !== "https:" || !/(?:^|\.)s3(?:[.-][a-z0-9-]+)?\.amazonaws\.com$/.test(url.hostname)) {
    context.addIssue({ code: "custom", message: "upload URL is outside S3" });
  }
});

export type MerchantMediaIssueInput = z.infer<typeof IssueInputSchema>;
export type MerchantMediaFinalizeInput = z.infer<typeof FinalizeInputSchema>;
export type MerchantMediaRegistration = z.infer<typeof RegistrationSchema>;
export type MerchantMediaUploadReady = z.infer<typeof UploadReadySchema>;

type BoundaryOptions<T> = {
  origin: string;
  serviceSecret: string;
  input: T;
  now?: number;
  fetcher?: typeof fetch;
};

function boundaryOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || !/^[a-z0-9]+\.execute-api\.[a-z0-9-]+\.amazonaws\.com$/.test(url.hostname)) {
    throw new Error(SAFE_ERROR);
  }
  return url.origin;
}

function secretBytes(value: string): Uint8Array {
  if (value.length < 32 || value.length > 512 || /[\r\n]/.test(value)) throw new Error(SAFE_ERROR);
  return new TextEncoder().encode(value);
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function sha256Base64(digest: string): string {
  const bytes = digest.match(/.{2}/g)?.map((pair) => Number.parseInt(pair, 16));
  if (!bytes || bytes.length !== 32) throw new Error(SAFE_ERROR);
  return btoa(String.fromCharCode(...bytes));
}

async function hmacHex(secret: Uint8Array, message: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", ownedArrayBuffer(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, ownedArrayBuffer(new TextEncoder().encode(message)));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function requestBoundary(path: string, options: BoundaryOptions<unknown>): Promise<unknown> {
  try {
    const origin = boundaryOrigin(options.origin);
    const body = JSON.stringify(options.input);
    const timestamp = String(options.now ?? Math.floor(Date.now() / 1000));
    const signature = await hmacHex(secretBytes(options.serviceSecret), `${timestamp}.${body}`);
    const response = await (options.fetcher ?? fetch)(`${origin}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-axcas-media-timestamp": timestamp,
        "x-axcas-media-signature": `sha256=${signature}`,
      },
      body,
      redirect: "error",
    });
    if (!response.ok || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") throw new Error(SAFE_ERROR);
    return await response.json();
  } catch {
    throw new Error(SAFE_ERROR);
  }
}

export async function issueMerchantMediaUpload(
  options: BoundaryOptions<MerchantMediaIssueInput>,
): Promise<MerchantMediaUploadReady | MerchantMediaRegistration> {
  try {
    const input = IssueInputSchema.parse(options.input);
    const value = await requestBoundary("/merchant-media/capabilities", { ...options, input });
    const result = z.union([UploadReadySchema, RegistrationSchema]).parse(value);
    if (result.status === "upload_ready") {
      const expectedPath = `/private/ingest/${input.merchantId}/${input.assetId}/${input.sha256}`;
      const headers = result.requiredHeaders;
      if (
        result.requiredByteLength !== input.byteLength
        || headers["content-type"] !== input.contentType
        || headers["x-amz-checksum-sha256"] !== sha256Base64(input.sha256)
        || new URL(result.uploadUrl).pathname !== expectedPath
      ) throw new Error(SAFE_ERROR);
    }
    if (result.status === "registered" && (result.merchantId !== input.merchantId || result.assetId !== input.assetId || result.sha256 !== input.sha256)) throw new Error(SAFE_ERROR);
    return result;
  } catch {
    throw new Error(SAFE_ERROR);
  }
}

export async function finalizeMerchantMedia(
  options: BoundaryOptions<MerchantMediaFinalizeInput>,
): Promise<MerchantMediaRegistration> {
  try {
    const input = FinalizeInputSchema.parse(options.input);
    const value = await requestBoundary("/merchant-media/finalize", { ...options, input });
    const result = RegistrationSchema.parse(value);
    if (result.merchantId !== input.merchantId || result.assetId !== input.assetId) throw new Error(SAFE_ERROR);
    return result;
  } catch {
    throw new Error(SAFE_ERROR);
  }
}
