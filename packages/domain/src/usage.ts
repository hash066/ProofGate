import { z } from "zod";

export const UsageMetricSchema = z.enum([
  "model_turns",
  "whatsapp_messages",
  "storage_bytes",
  "render_seconds",
  "polly_characters",
  "call_cost_microusd",
]);
export type UsageMetric = z.infer<typeof UsageMetricSchema>;

const nonNegativeInteger = z.number().int().nonnegative().finite();

export const TenantPlanSchema = z.object({
  schemaVersion: z.literal(1),
  planCode: z.string().min(1),
  limits: z.record(UsageMetricSchema, nonNegativeInteger),
});
export type TenantPlan = z.infer<typeof TenantPlanSchema>;

export const FOUNDING_BETA_PLAN: TenantPlan = {
  schemaVersion: 1,
  planCode: "founding_beta_v1",
  limits: {
    model_turns: 200,
    whatsapp_messages: 1_000,
    storage_bytes: 250 * 1024 * 1024,
    render_seconds: 180,
    polly_characters: 10_000,
    // A hard provider-cost ceiling; consent, country and approval gates still apply separately.
    call_cost_microusd: 5_000_000,
  },
};

export const UsageEntrySchema = z.object({
  schemaVersion: z.literal(1),
  usageEntryId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  operationId: z.string().min(1),
  merchantId: z.string().min(1),
  metric: UsageMetricSchema,
  quantity: nonNegativeInteger,
  basis: z.enum(["reserved", "actual"]),
  periodStart: nonNegativeInteger,
  evidenceRef: z.string().min(1).optional(),
  createdAt: nonNegativeInteger,
}).superRefine((entry, context) => {
  if (entry.basis === "actual" && !entry.evidenceRef) {
    context.addIssue({ code: "custom", path: ["evidenceRef"], message: "actual usage requires provider evidence" });
  }
});
export type UsageEntry = z.infer<typeof UsageEntrySchema>;

export const UsageReservationSchema = z.object({
  metric: UsageMetricSchema,
  quantity: nonNegativeInteger.positive(),
});

export const UsageReservationBatchSchema = z.object({
  merchantId: z.string().min(1),
  operationId: z.string().min(1),
  idempotencyKey: z.string().min(1),
  requestedAt: nonNegativeInteger,
  reservations: z.array(UsageReservationSchema).min(1).superRefine((reservations, context) => {
    const metrics = reservations.map(({ metric }) => metric);
    if (new Set(metrics).size !== metrics.length) context.addIssue({ code: "custom", message: "duplicate metrics are not allowed" });
  }),
});
export type UsageReservationBatch = z.infer<typeof UsageReservationBatchSchema>;

export function usagePeriodStart(metric: UsageMetric, at: number): number {
  if (metric === "storage_bytes") return 0;
  const date = new Date(at);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
}

export function aggregateBillableUsage(entries: UsageEntry[]): number {
  const operations = new Map<string, { reserved?: number; actual?: number }>();
  for (const entry of entries) {
    const current = operations.get(entry.operationId) ?? {};
    current[entry.basis] = (current[entry.basis] ?? 0) + entry.quantity;
    operations.set(entry.operationId, current);
  }
  return [...operations.values()].reduce((sum, entry) => sum + (entry.actual ?? entry.reserved ?? 0), 0);
}

export function evaluateQuota(input: { used: number; requested: number; limit: number }) {
  const allowed = input.used + input.requested <= input.limit;
  return { allowed, ...input, remaining: Math.max(0, input.limit - input.used - (allowed ? input.requested : 0)) };
}

export function quotaExceededCustomerMessage(_metric: UsageMetric): string {
  return "You’ve reached an Axcas usage limit. Your request is saved, and no paid action was started.";
}
