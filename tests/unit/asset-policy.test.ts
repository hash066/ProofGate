import { describe, expect, it } from "vitest";

import { assertImmutableAssetRegistration, validateStoredAssetMetadata } from "../../convex/asset_policy";

const storageId = "kg2storageid00000000000000000000";
const base = {
  assetId: "cake-1",
  merchantId: "merchant-1",
  storageBackend: "convex" as const,
  convexStorageId: storageId,
  sha256: "a".repeat(64),
};

describe("asset registration policy", () => {
  it("allows exact idempotent replay and rejects ownership or storage changes", () => {
    expect(assertImmutableAssetRegistration(base, { ...base })).toBe(false);
    expect(() => assertImmutableAssetRegistration(base, { ...base, merchantId: "merchant-2" })).toThrow("immutable asset conflict");
    expect(() => assertImmutableAssetRegistration(base, { ...base, storageBackend: "r2", convexStorageId: undefined, objectKey: "assets/cake-1/a" })).toThrow("immutable asset conflict");
    expect(() => assertImmutableAssetRegistration(base, { ...base, convexStorageId: "kg2different0000000000000000000" })).toThrow("immutable asset conflict");
    expect(() => assertImmutableAssetRegistration(base, { ...base, sha256: "b".repeat(64) })).toThrow("immutable asset conflict");
  });

  it("requires Convex storage metadata to match size, type, and digest", () => {
    const expected = { byteLength: 4, contentType: "image/jpeg", sha256: "a".repeat(64) };
    expect(() => validateStoredAssetMetadata({ size: 4, contentType: "image/jpeg", sha256: "a".repeat(64) }, expected)).not.toThrow();
    expect(() => validateStoredAssetMetadata(null, expected)).toThrow("missing");
    expect(() => validateStoredAssetMetadata({ size: 5, contentType: "image/jpeg", sha256: "a".repeat(64) }, expected)).toThrow("metadata mismatch");
    expect(() => validateStoredAssetMetadata({ size: 4, contentType: "image/png", sha256: "a".repeat(64) }, expected)).toThrow("metadata mismatch");
    expect(() => validateStoredAssetMetadata({ size: 4, contentType: "image/jpeg", sha256: "b".repeat(64) }, expected)).toThrow("metadata mismatch");
  });

  it("accepts Convex SHA-256 metadata encoded as base64 or base64url", () => {
    const digestHex = "a".repeat(64);
    const digestBase64 = Buffer.from(digestHex, "hex").toString("base64");
    const digestBase64Url = digestBase64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const expected = { byteLength: 4, contentType: "image/jpeg", sha256: digestHex };

    expect(() => validateStoredAssetMetadata({ size: 4, contentType: "image/jpeg", sha256: digestBase64 }, expected)).not.toThrow();
    expect(() => validateStoredAssetMetadata({ size: 4, contentType: "image/jpeg", sha256: digestBase64Url }, expected)).not.toThrow();
  });
});
