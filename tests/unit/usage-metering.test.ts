import { describe, expect, it } from "vitest";

import {
  FOUNDING_BETA_PLAN,
  TenantPlanSchema,
  UsageEntrySchema,
  aggregateBillableUsage,
  evaluateQuota,
  quotaExceededCustomerMessage,
  usagePeriodStart,
} from "../../packages/domain/src/usage";

describe("authoritative tenant usage and quotas", () => {
  it("defines finite hard limits for every expensive product dimension", () => {
    const plan = TenantPlanSchema.parse(FOUNDING_BETA_PLAN);
    expect(plan.limits).toEqual(expect.objectContaining({
      model_turns: expect.any(Number),
      whatsapp_messages: expect.any(Number),
      storage_bytes: expect.any(Number),
      render_seconds: expect.any(Number),
      polly_characters: expect.any(Number),
      call_cost_microusd: expect.any(Number),
    }));
    expect(Object.values(plan.limits).every(Number.isFinite)).toBe(true);
  });

  it("uses a lifetime storage period and deterministic UTC monthly periods elsewhere", () => {
    expect(usagePeriodStart("storage_bytes", Date.parse("2026-08-31T23:59:59Z"))).toBe(0);
    expect(usagePeriodStart("model_turns", Date.parse("2026-08-31T23:59:59Z"))).toBe(Date.parse("2026-08-01T00:00:00Z"));
    expect(usagePeriodStart("model_turns", Date.parse("2026-09-01T00:00:00Z"))).toBe(Date.parse("2026-09-01T00:00:00Z"));
  });

  it("counts an actual provider result instead of double-counting its reservation", () => {
    const reserved = UsageEntrySchema.parse({
      schemaVersion: 1, usageEntryId: "usage-reserved-1", idempotencyKey: "reserve-render-1",
      operationId: "render-reel-1", merchantId: "merchant-maya", metric: "render_seconds",
      quantity: 15, basis: "reserved", periodStart: 1, createdAt: 1,
    });
    const actual = UsageEntrySchema.parse({
      ...reserved, usageEntryId: "usage-actual-1", idempotencyKey: "actual-render-1",
      quantity: 14, basis: "actual", evidenceRef: "ffprobe:sha256-proof", createdAt: 2,
    });
    expect(aggregateBillableUsage([reserved, actual])).toBe(14);
  });

  it("rejects claimed actual usage without independently referenceable evidence", () => {
    expect(() => UsageEntrySchema.parse({
      schemaVersion: 1, usageEntryId: "usage-actual-unsafe", idempotencyKey: "actual-unsafe",
      operationId: "render-reel-unsafe", merchantId: "merchant-maya", metric: "render_seconds",
      quantity: 15, basis: "actual", periodStart: 1, createdAt: 1,
    })).toThrow(/provider evidence/i);
  });

  it("fails closed before a reservation would exceed the tenant limit", () => {
    expect(evaluateQuota({ used: 90, requested: 10, limit: 100 })).toEqual({ allowed: true, used: 90, requested: 10, limit: 100, remaining: 0 });
    expect(evaluateQuota({ used: 90, requested: 11, limit: 100 })).toEqual({ allowed: false, used: 90, requested: 11, limit: 100, remaining: 10 });
  });

  it("returns a customer-safe limit message without infrastructure details", () => {
    const message = quotaExceededCustomerMessage("render_seconds");
    expect(message).toMatch(/usage limit/i);
    expect(message).not.toMatch(/ProofGate|Convex|AWS|secret|quota table|stack/i);
  });
});
