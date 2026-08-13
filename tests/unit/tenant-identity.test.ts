import { describe, expect, it } from "vitest";

import { deriveTenantIdentity, normalizeWhatsAppId, tenantScopedAssetId } from "../../packages/domain/src/tenant";

describe("multi-tenant WhatsApp identity", () => {
  it("normalizes a WA-ID and derives a stable opaque merchant identity", async () => {
    expect(normalizeWhatsAppId("+91 98765-43210")).toBe("919876543210");
    const first = await deriveTenantIdentity("+91 98765-43210");
    const replay = await deriveTenantIdentity("919876543210");
    expect(first).toEqual(replay);
    expect(first.ownerWaIdHash).toMatch(/^[a-f0-9]{64}$/);
    expect(first.merchantId).toMatch(/^merchant-[a-f0-9]{24}$/);
    expect(JSON.stringify(first)).not.toContain("919876543210");
  });

  it("isolates different WhatsApp senders", async () => {
    const left = await deriveTenantIdentity("919876543210");
    const right = await deriveTenantIdentity("15551234567");
    expect(left.merchantId).not.toBe(right.merchantId);
    expect(left.ownerWaIdHash).not.toBe(right.ownerWaIdHash);
    expect(tenantScopedAssetId(left, "hero-photo")).not.toBe(tenantScopedAssetId(right, "hero-photo"));
  });

  it("creates deterministic globally unique asset IDs from tenant-local names", async () => {
    const tenant = await deriveTenantIdentity("919876543210");
    expect(tenantScopedAssetId(tenant, "hero-photo")).toBe(`asset-${tenant.ownerWaIdHash.slice(0, 12)}-hero-photo`);
    expect(() => tenantScopedAssetId(tenant, "../photo")).toThrow("Invalid tenant-local asset ID");
  });

  it.each(["", "123", "abc", "+0012345678"])("rejects invalid WA-ID %j", (value) => {
    expect(() => normalizeWhatsAppId(value)).toThrow("Invalid WhatsApp sender identity");
  });
});
