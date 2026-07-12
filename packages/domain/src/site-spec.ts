import { z } from "zod";

const safeText = z.string().trim().min(1).max(500).refine(
  (value) => !/[<>]|javascript:/i.test(value),
  "HTML, scripts, and javascript URLs are not allowed in SiteSpec text",
);
const optionalSafeText = safeText.optional();
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "accent must be a six-digit hex color");
const dateTime = z.string().refine((value) => Number.isFinite(Date.parse(value)), "invalid date-time");

const ContactSchema = z.object({
  phone: optionalSafeText,
  email: z.email().optional(),
  telegram: z.string().regex(/^@[A-Za-z0-9_]{5,32}$/).optional(),
});

const FieldSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  label: safeText,
  type: z.enum(["text", "email", "phone", "select"]),
  required: z.boolean(),
  options: z.array(safeText).max(20).optional(),
});

const QuantitySchema = z
  .object({ enabled: z.boolean(), min: z.int().min(1), max: z.int().min(1).max(50), default: z.int().min(1) })
  .refine((quantity) => quantity.min <= quantity.default && quantity.default <= quantity.max, {
    message: "quantity default must fall within min and max",
  });

const BookingOfferSchema = z.object({
  kind: z.literal("booking"),
  title: safeText,
  description: safeText,
  quantity: QuantitySchema,
  fields: z.array(FieldSchema).min(1).max(12),
  booking: z.object({
    timezone: safeText,
    slots: z
      .array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]+$/), startsAt: dateTime, capacity: z.int().min(1) }))
      .min(1),
  }),
});

export const SiteSpecSchema = z.object({
  schemaVersion: z.literal(1),
  siteId: z.string().regex(/^[a-z0-9-]{3,64}$/),
  business: z.object({
    name: safeText,
    tagline: optionalSafeText,
    description: safeText,
    timezone: safeText,
    contact: ContactSchema,
  }),
  theme: z.object({ preset: z.enum(["clean", "warm", "bold"]), accent: hexColor, radius: z.enum(["small", "medium", "large"]) }),
  hero: z.object({ headline: safeText, subheadline: safeText, imageAssetId: z.string().regex(/^[a-zA-Z0-9_-]+$/).optional() }),
  cta: z.object({ label: safeText, enabled: z.boolean(), stickyOnMobile: z.boolean(), style: z.enum(["solid", "outline"]) }),
  offer: BookingOfferSchema,
  confirmation: z.object({
    buyerChannels: z.array(z.enum(["email", "telegram", "whatsapp"])),
    merchantChannels: z.array(z.enum(["email", "telegram"])),
    message: safeText,
    voiceRequired: z.boolean(),
  }),
  claims: z.array(
    z.object({
      text: safeText,
      category: z.enum(["identity", "hours", "location", "superlative", "regulated", "other"]),
      requiredForRelease: z.boolean(),
      decision: z.enum(["verified", "merchant_supplied_allowed", "rejected"]),
      sourceUrl: z.url().startsWith("https://").optional(),
      sourceSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
      verifiedAt: z.number().int().positive().optional(),
    }),
  ),
  policies: z.object({ refund: optionalSafeText, cancellation: optionalSafeText, fulfillment: optionalSafeText }),
  proofBadge: z.object({ enabled: z.boolean(), passportSlug: z.string().regex(/^[a-z0-9-]{3,64}$/) }),
});

export type SiteSpec = z.infer<typeof SiteSpecSchema>;

export const initialSpikeSiteSpec = {
  schemaVersion: 1,
  siteId: "saturday-sessions",
  business: {
    name: "Saturday Sessions",
    tagline: "Product clarity in one morning",
    description: "A focused small-group workshop for founders.",
    timezone: "Asia/Kolkata",
    contact: {},
  },
  theme: { preset: "warm", accent: "#bd4c2f", radius: "large" },
  hero: {
    headline: "Turn the idea in your notes into a product people understand.",
    subheadline: "Leave with a sharper offer, a useful prototype, and a plan for Monday morning.",
  },
  cta: { label: "Reserve my seat", enabled: true, stickyOnMobile: true, style: "solid" },
  offer: {
    kind: "booking",
    title: "Product Clarity Workshop",
    description: "Saturday, 18 July · 10:00–13:00 IST · 12 seats",
    quantity: { enabled: true, min: 1, max: 3, default: 1 },
    fields: [
      { id: "buyer-name", label: "Your name", type: "text", required: true },
      { id: "buyer-email", label: "Email", type: "email", required: true },
    ],
    booking: { timezone: "Asia/Kolkata", slots: [{ id: "sat-am", startsAt: "2026-07-18T10:00:00+05:30", capacity: 12 }] },
  },
  confirmation: {
    buyerChannels: ["email"],
    merchantChannels: ["telegram"],
    message: "Your local development reservation is confirmed.",
    voiceRequired: false,
  },
  claims: [],
  policies: { cancellation: "Cancel any time before the workshop." },
  proofBadge: { enabled: true, passportSlug: "saturday-sessions" },
} satisfies SiteSpec;
