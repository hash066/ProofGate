import { z } from "zod";

import { SiteSpecSchema, type SiteSpec } from "./site-spec";

const versionId = z.string().regex(/^[A-Za-z0-9-]{3,64}$/);

export const SiteVersionSchema = z.object({
  schemaVersion: z.literal(1),
  versionId,
  siteId: z.string().regex(/^[a-z0-9-]{3,64}$/),
  parentVersionId: versionId.nullable(),
  spec: SiteSpecSchema,
  specHash: z.string().regex(/^[a-f0-9]{64}$/),
  actor: z.string().min(3).max(100),
  createdAt: z.number().int().positive(),
});

export type SiteVersion = z.infer<typeof SiteVersionSchema>;

type VersionMetadata = {
  versionId: string;
  parentVersionId: string | null;
  actor: string;
  createdAt: number;
};

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashSiteSpec(spec: SiteSpec): Promise<string> {
  return sha256(canonicalize(SiteSpecSchema.parse(spec)));
}

export async function buildSiteVersion(specInput: unknown, metadata: VersionMetadata): Promise<SiteVersion> {
  const spec = SiteSpecSchema.parse(specInput);
  return SiteVersionSchema.parse({
    schemaVersion: 1,
    versionId: metadata.versionId,
    siteId: spec.siteId,
    parentVersionId: metadata.parentVersionId,
    spec,
    specHash: await hashSiteSpec(spec),
    actor: metadata.actor,
    createdAt: metadata.createdAt,
  });
}

export async function verifySiteVersionIntegrity(versionInput: SiteVersion): Promise<true> {
  const version = SiteVersionSchema.parse(versionInput);
  if ((await hashSiteSpec(version.spec)) !== version.specHash) {
    throw new Error("SiteVersion integrity check failed");
  }
  if (version.spec.siteId !== version.siteId) throw new Error("SiteVersion site binding integrity check failed");
  return true;
}
