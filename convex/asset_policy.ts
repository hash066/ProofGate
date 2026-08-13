export type AssetStorageBackend = "r2" | "convex";

export type AssetIdentity = {
  assetId: string;
  merchantId: string;
  storageBackend?: AssetStorageBackend;
  objectKey?: string;
  convexStorageId?: string;
  sha256: string;
};

function backend(asset: AssetIdentity): AssetStorageBackend {
  return asset.storageBackend ?? "r2";
}

export function assertImmutableAssetRegistration(existing: AssetIdentity | null, proposed: AssetIdentity): boolean {
  if (!existing) return true;
  const existingBackend = backend(existing);
  const proposedBackend = backend(proposed);
  const storageMatches = existingBackend === "convex"
    ? existing.convexStorageId === proposed.convexStorageId
    : existing.objectKey === proposed.objectKey;
  if (
    existing.assetId !== proposed.assetId
    || existing.sha256 !== proposed.sha256
    || existing.merchantId !== proposed.merchantId
    || existingBackend !== proposedBackend
    || !storageMatches
  ) throw new Error("immutable asset conflict");
  return false;
}

function hexDigestToBase64(hex: string): string {
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("invalid expected SHA-256 digest");
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = Array.from({ length: 32 }, (_, index) => Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16));
  let encoded = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const remaining = bytes.length - index;
    const value = (bytes[index] << 16) | ((bytes[index + 1] ?? 0) << 8) | (bytes[index + 2] ?? 0);
    encoded += alphabet[(value >>> 18) & 63];
    encoded += alphabet[(value >>> 12) & 63];
    encoded += remaining > 1 ? alphabet[(value >>> 6) & 63] : "=";
    encoded += remaining > 2 ? alphabet[value & 63] : "=";
  }
  return encoded;
}

function storedDigestMatches(stored: string, expectedHex: string): boolean {
  if (/^[0-9a-f]{64}$/i.test(stored)) return stored.toLowerCase() === expectedHex.toLowerCase();
  const expectedBase64 = hexDigestToBase64(expectedHex);
  if (stored === expectedBase64) return true;
  const expectedBase64Url = expectedBase64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return stored.replace(/=+$/, "") === expectedBase64Url;
}

export function validateStoredAssetMetadata(
  metadata: null | { size: number; contentType?: string; sha256: string },
  expected: { byteLength: number; contentType: string; sha256: string },
): void {
  if (!metadata) throw new Error("Convex stored asset metadata is missing");
  const sizeMatches = metadata.size === expected.byteLength;
  const contentTypeMatches = metadata.contentType === expected.contentType;
  const sha256Matches = storedDigestMatches(metadata.sha256, expected.sha256);
  if (!sizeMatches || !contentTypeMatches || !sha256Matches) {
    throw new Error(`Convex stored asset metadata mismatch (size=${sizeMatches}, contentType=${contentTypeMatches}, sha256=${sha256Matches})`);
  }
}
