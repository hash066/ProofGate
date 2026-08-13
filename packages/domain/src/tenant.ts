export type TenantIdentity = {
  merchantId: string;
  ownerWaIdHash: string;
};

export function normalizeWhatsAppId(input: string): string {
  const value = input.replace(/[\s()+-]/g, "");
  if (!/^[1-9]\d{7,14}$/.test(value)) throw new Error("Invalid WhatsApp sender identity");
  return value;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function deriveTenantIdentity(input: string): Promise<TenantIdentity> {
  const ownerWaIdHash = await sha256(normalizeWhatsAppId(input));
  return { merchantId: `merchant-${ownerWaIdHash.slice(0, 24)}`, ownerWaIdHash };
}

export function tenantScopedAssetId(identity: TenantIdentity, localAssetId: string): string {
  if (!/^[a-zA-Z0-9_-]{3,100}$/.test(localAssetId)) throw new Error("Invalid tenant-local asset ID");
  return `asset-${identity.ownerWaIdHash.slice(0, 12)}-${localAssetId}`;
}
