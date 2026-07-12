import { describe, expect, it } from "vitest";

import { initialSpikeSiteSpec } from "../../packages/domain/src/site-spec";
import { buildSiteVersion, verifySiteVersionIntegrity } from "../../packages/domain/src/site-version";

describe("immutable SiteSpec versions", () => {
  it("canonicalizes, hashes, and verifies a complete SiteSpec", async () => {
    const version = await buildSiteVersion(initialSpikeSiteSpec, {
      versionId: "version-1",
      parentVersionId: null,
      actor: "site-builder",
      createdAt: 1_700_000_000_000,
    });

    expect(version.specHash).toMatch(/^[a-f0-9]{64}$/);
    expect(version.spec.siteId).toBe("saturday-sessions");
    await expect(verifySiteVersionIntegrity(version)).resolves.toBe(true);
  });

  it("changes the hash for behavioral edits and rejects a forged hash", async () => {
    const original = await buildSiteVersion(initialSpikeSiteSpec, {
      versionId: "version-1",
      parentVersionId: null,
      actor: "site-builder",
      createdAt: 1_700_000_000_000,
    });
    const changed = await buildSiteVersion(
      {
        ...initialSpikeSiteSpec,
        offer: {
          ...initialSpikeSiteSpec.offer,
          quantity: { ...initialSpikeSiteSpec.offer.quantity, max: 8 },
        },
      },
      {
        versionId: "version-2",
        parentVersionId: original.versionId,
        actor: "quantity-specialist",
        createdAt: 1_700_000_001_000,
      },
    );

    expect(changed.specHash).not.toBe(original.specHash);
    await expect(verifySiteVersionIntegrity({ ...changed, specHash: "f".repeat(64) })).rejects.toThrow("integrity");
  });
});
