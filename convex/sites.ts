import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalAction, internalMutation, query } from "./_generated/server";
import { buildSiteVersion } from "../packages/domain/src/site-version";

export const persistVersion = internalMutation({
  args: {
    slug: v.string(),
    versionId: v.string(),
    parentVersionId: v.optional(v.string()),
    specJson: v.string(),
    specHash: v.string(),
    actor: v.string(),
    createdAt: v.number(),
  },
  handler: async (context, args) => {
    let site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", args.slug)).unique();
    if (!site) {
      const siteId = await context.db.insert("sites", {
        slug: args.slug,
        createdAt: args.createdAt,
        updatedAt: args.createdAt,
      });
      site = await context.db.get(siteId);
    }
    if (!site) throw new Error("site creation failed");

    const existing = await context.db
      .query("siteVersions")
      .withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", args.versionId))
      .unique();
    if (existing) {
      if (existing.specHash !== args.specHash || existing.specJson !== args.specJson) {
        throw new Error("immutable SiteVersion already exists with different content");
      }
      await context.db.patch(site._id, { canaryVersionId: args.versionId, updatedAt: Date.now() });
      return { inserted: false, siteId: site._id, siteVersionId: existing._id, specHash: existing.specHash };
    }

    const siteVersionId = await context.db.insert("siteVersions", {
      siteId: site._id,
      versionId: args.versionId,
      parentVersionId: args.parentVersionId,
      specJson: args.specJson,
      specHash: args.specHash,
      actor: args.actor,
      createdAt: args.createdAt,
    });
    await context.db.patch(site._id, { canaryVersionId: args.versionId, updatedAt: args.createdAt });
    return { inserted: true, siteId: site._id, siteVersionId, specHash: args.specHash };
  },
});

export const createVersion = internalAction({
  args: {
    specJson: v.string(),
    versionId: v.string(),
    parentVersionId: v.optional(v.string()),
    actor: v.string(),
    createdAt: v.number(),
  },
  handler: async (context, args): Promise<{ inserted: boolean; specHash: string }> => {
    const version = await buildSiteVersion(JSON.parse(args.specJson), {
      versionId: args.versionId,
      parentVersionId: args.parentVersionId ?? null,
      actor: args.actor,
      createdAt: args.createdAt,
    });
    const result = await context.runMutation(internal.sites.persistVersion, {
      slug: version.siteId,
      versionId: version.versionId,
      parentVersionId: version.parentVersionId ?? undefined,
      specJson: JSON.stringify(version.spec),
      specHash: version.specHash,
      actor: version.actor,
      createdAt: version.createdAt,
    });
    return { inserted: result.inserted, specHash: result.specHash };
  },
});

export const getManifestBySlug = query({
  args: {
    slug: v.string(),
    channel: v.union(v.literal("canary"), v.literal("production")),
  },
  handler: async (context, { slug, channel }) => {
    const site = await context.db.query("sites").withIndex("by_slug", (range) => range.eq("slug", slug)).unique();
    if (!site) return null;
    const versionId = channel === "canary" ? site.canaryVersionId : site.productionVersionId;
    if (!versionId) return null;
    const version = await context.db
      .query("siteVersions")
      .withIndex("by_site_version", (range) => range.eq("siteId", site._id).eq("versionId", versionId))
      .unique();
    if (!version) throw new Error("site pointer references a missing immutable version");
    return {
      slug,
      channel,
      versionId: version.versionId,
      specHash: version.specHash,
      specJson: version.specJson,
    };
  },
});
