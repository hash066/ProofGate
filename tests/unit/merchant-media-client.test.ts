import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { finalizeMerchantMedia, issueMerchantMediaUpload } from "../../packages/merchant-media/src/client";

const origin = "https://abc123.execute-api.ap-south-1.amazonaws.com";
const secret = "s".repeat(64);
const issue = {
  schemaVersion: 1 as const,
  merchantId: "merchant-demo",
  assetId: "asset-photo-1",
  sha256: "a1".repeat(32),
  byteLength: 1024,
  contentType: "image/jpeg" as const,
  sourceProviderMessageId: "wamid.demo",
};

describe("merchant-media AWS client", () => {
  it("HMAC signs the exact bounded request without sending the service secret", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = String(init?.body);
      const timestamp = String((init?.headers as Record<string, string>)["x-axcas-media-timestamp"]);
      expect((init?.headers as Record<string, string>)["x-axcas-media-signature"]).toBe(
        `sha256=${createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")}`,
      );
      expect(body).not.toContain(secret);
      return new Response(JSON.stringify({
        status: "upload_ready",
        capabilityId: "12345678-1234-1234-1234-123456789abc",
        expiresAt: 1_788_000_300,
        expiresInSeconds: 300,
        uploadUrl: `https://private-bucket.s3.amazonaws.com/private/ingest/merchant-demo/asset-photo-1/${issue.sha256}?X-Amz-Signature=fake`,
        requiredByteLength: 1024,
        requiredHeaders: {
          "content-type": "image/jpeg",
          "x-amz-checksum-sha256": Buffer.from(issue.sha256, "hex").toString("base64"),
          "x-amz-server-side-encryption": "AES256",
        },
      }), { status: 201, headers: { "content-type": "application/json" } });
    });

    const result = await issueMerchantMediaUpload({ origin, serviceSecret: secret, input: issue, now: 1_788_000_000, fetcher });
    expect(result.status).toBe("upload_ready");
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it("finalizes only an exact tenant-bound capability and accepts a safe registration", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(String(init?.body)).toContain('"merchantId":"merchant-demo"');
      return new Response(JSON.stringify({
        status: "registered", storageBackend: "s3", merchantId: "merchant-demo",
        assetId: "asset-photo-1", objectKey: `private/ingest/merchant-demo/asset-photo-1/${"a1".repeat(32)}`,
        sha256: "a1".repeat(32), byteLength: 1024, contentType: "image/jpeg", sourceProviderMessageId: "wamid.demo",
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const result = await finalizeMerchantMedia({
      origin, serviceSecret: secret, now: 1_788_000_001, fetcher,
      input: { schemaVersion: 1, merchantId: "merchant-demo", assetId: "asset-photo-1", capabilityId: "12345678-1234-1234-1234-123456789abc" },
    });
    expect(result).toMatchObject({ status: "registered", storageBackend: "s3", merchantId: "merchant-demo" });
  });

  it("fails closed on an unsafe origin or raw AWS error", async () => {
    await expect(issueMerchantMediaUpload({ origin: "http://localhost:9999", serviceSecret: secret, input: issue })).rejects.toThrow("Merchant media boundary is unavailable");
    const fetcher = vi.fn(async () => new Response("AWS credential provider stack trace", { status: 500 }));
    await expect(issueMerchantMediaUpload({ origin, serviceSecret: secret, input: issue, fetcher })).rejects.toThrow("Merchant media boundary is unavailable");
  });

  it("rejects an upload capability whose signed object requirements do not match the requested asset", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      status: "upload_ready",
      capabilityId: "12345678-1234-1234-1234-123456789abc",
      expiresAt: 1_788_000_300,
      expiresInSeconds: 300,
      uploadUrl: `https://private-bucket.s3.amazonaws.com/private/ingest/merchant-demo/asset-photo-1/${issue.sha256}?X-Amz-Signature=fake`,
      requiredByteLength: issue.byteLength,
      requiredHeaders: {
        "content-type": "video/mp4",
        "x-amz-checksum-sha256": "wrong-checksum",
        "x-amz-server-side-encryption": "AES256",
      },
    }), { status: 201, headers: { "content-type": "application/json" } }));

    await expect(issueMerchantMediaUpload({ origin, serviceSecret: secret, input: issue, fetcher })).rejects.toThrow(
      "Merchant media boundary is unavailable",
    );
  });
});
