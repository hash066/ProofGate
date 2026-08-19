import { BusinessBriefSchema, SiteSpecV2Schema, type BusinessBriefV1, type BusinessType, type SiteSpecV2 } from "./growth";
import { StudioProjectInputSchema, type StudioProjectInput } from "./studio";

export type StudioOwnerIdentity = { merchantId: string; ownerWaIdHash: string };
export type MissingStudioFact = "orderWhatsAppNumber" | "fulfillmentArea" | "leadTime" | "offerings" | "referenceAssetIds";

export class MissingStudioFactsError extends Error {
  constructor(readonly missing: MissingStudioFact[]) {
    super(`Studio project is missing: ${missing.join(", ")}`);
    this.name = "MissingStudioFactsError";
  }
}

function slugify(value: string, fallback = "business"): string {
  const slug = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (slug || fallback).slice(0, 56).replace(/-+$/g, "");
}

export function inferStudioBusinessType(description: string): BusinessType {
  const value = description.toLowerCase();
  if (/bak(?:e|er|ery|ing)|cake|bread|cookie|dessert|pastr/.test(value)) return "home_bakery";
  if (/tailor|stitch|blouse|alteration|garment|sew/.test(value)) return "tailor";
  if (/tutor|tuition|teach|coaching|lesson|classes|education/.test(value)) return "tutor";
  if (/salon|hair|beauty|nail|makeup|spa|groom/.test(value)) return "salon";
  if (/plumb|electric|repair|cleaning|pest|carpenter|home service/.test(value)) return "home_service";
  if (/retail|shop|store|boutique|resell|products?/.test(value)) return "retailer";
  return "other";
}

function requiredFacts(project: StudioProjectInput): MissingStudioFact[] {
  const missing: MissingStudioFact[] = [];
  if (!project.orderWhatsAppNumber) missing.push("orderWhatsAppNumber");
  if (!project.fulfillmentArea) missing.push("fulfillmentArea");
  if (!project.leadTime) missing.push("leadTime");
  if (!project.offerings?.length) missing.push("offerings");
  if (!(project.siteAssetIds.length || project.referenceAssetIds.length)) missing.push("referenceAssetIds");
  return missing;
}

const accentByType: Record<BusinessType, string> = {
  home_bakery: "#b84f3a",
  tailor: "#6546a8",
  tutor: "#2563a7",
  salon: "#a33b72",
  home_service: "#247467",
  retailer: "#b25420",
  other: "#3f5f75",
};

export function buildStudioWebsite(input: unknown, owner: StudioOwnerIdentity): { brief: BusinessBriefV1; spec: SiteSpecV2 } {
  const project = StudioProjectInputSchema.parse(input);
  if (project.intent === "reels") throw new Error("reels-only projects do not contain a website");
  const missing = requiredFacts(project);
  if (missing.length) throw new MissingStudioFactsError(missing);

  const businessType = inferStudioBusinessType(`${project.businessName} ${project.description}`);
  const websiteAssets = project.siteAssetIds.length ? project.siteAssetIds : project.referenceAssetIds;
  const suffix = owner.merchantId.replace(/[^a-z0-9]/g, "").slice(-6).padStart(6, "0");
  const siteId = `${slugify(project.businessName)}-${suffix}`.slice(0, 64).replace(/-+$/g, "");
  const usedIds = new Map<string, number>();
  const catalog = project.offerings!.map((offering, index) => {
    const baseId = slugify(offering.name, `offering-${index + 1}`).slice(0, 56);
    const count = (usedIds.get(baseId) ?? 0) + 1;
    usedIds.set(baseId, count);
    const id = count === 1 ? baseId : `${baseId.slice(0, 61)}-${count}`;
    return {
      id,
      name: offering.name,
      description: offering.description,
      priceMinor: offering.priceMinor,
      currency: offering.currency,
      imageAssetId: websiteAssets[index % websiteAssets.length]!,
      available: true,
      whatsappMessage: `Hello, I'd like to ask about ${offering.name} from ${project.businessName}.`,
    };
  });
  const timezone = project.timezone ?? "Asia/Kolkata";
  const firstAssetId = websiteAssets[0]!;

  const brief = BusinessBriefSchema.parse({
    schemaVersion: 1,
    ...owner,
    businessType,
    businessName: project.businessName,
    timezone,
    locale: "en-IN",
    description: project.description,
    orderWhatsAppNumber: project.orderWhatsAppNumber!,
    fulfillmentArea: project.fulfillmentArea!,
    leadTime: project.leadTime!,
    suppliedClaims: project.suppliedClaims,
    catalog: catalog.map(({ name, description, priceMinor, currency, imageAssetId }) => ({ name, description, priceMinor, currency, imageAssetId })),
  });
  const spec = SiteSpecV2Schema.parse({
    schemaVersion: 2,
    siteId,
    businessType,
    business: {
      merchantId: owner.merchantId,
      name: project.businessName,
      description: project.description,
      timezone,
      locale: "en-IN",
      orderWhatsAppNumber: project.orderWhatsAppNumber!,
    },
    theme: { accent: accentByType[businessType], background: "#fbf8f2", layout: project.siteStyle },
    hero: {
      headline: `Explore ${project.businessName}.`,
      subheadline: project.description,
      imageAssetId: firstAssetId,
    },
    fulfillment: { area: project.fulfillmentArea!, leadTime: project.leadTime! },
    catalog,
    whatsappCta: { label: "Message on WhatsApp", defaultMessage: `Hello, I'd like to know more about ${project.businessName}.`, stickyOnMobile: true },
    policies: {
      ordering: "Message us on WhatsApp to confirm availability and the next step.",
      ...(businessType === "home_bakery" ? { allergens: "Please share allergy information before ordering." } : {}),
    },
    seo: { title: `${project.businessName} — ${project.fulfillmentArea}`, description: project.description, socialImageAssetId: firstAssetId },
    suppliedClaims: project.suppliedClaims,
    proofBadge: { enabled: true, passportSlug: siteId },
  });
  return { brief, spec };
}
