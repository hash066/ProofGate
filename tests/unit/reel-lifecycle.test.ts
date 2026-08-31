import { describe, expect, it } from "vitest";

import { transitionReelLifecycle, type ReelLifecycleStatus } from "../../packages/domain/src/reel-lifecycle";
import { resolveReelSignals } from "../../packages/domain/src/reel-signals";

describe("reel provider lifecycle", () => {
  it("advances through approval, render, private delivery, and completion", () => {
    let status: ReelLifecycleStatus = "draft";
    for (const event of ["approve", "claim_render", "render_succeeded", "begin_delivery", "delivery_succeeded"] as const) {
      const result = transitionReelLifecycle(status, event);
      expect(result.applied).toBe(true);
      status = result.status;
    }
    expect(status).toBe("delivered");
  });

  it("treats a replay of the completed transition as idempotent and rejects skipping states", () => {
    expect(transitionReelLifecycle("delivered", "delivery_succeeded")).toEqual({ status: "delivered", applied: false });
    expect(() => transitionReelLifecycle("rendered", "delivery_succeeded")).toThrow("invalid reel transition");
    expect(transitionReelLifecycle("delivering", "delivery_failed")).toEqual({ status: "delivery_failed", applied: true });
  });
});

describe("truthful reel signals", () => {
  it("returns insufficient_signal when no dated source evidence is available", () => {
    expect(resolveReelSignals([], Date.UTC(2026, 7, 31))).toEqual({ status: "insufficient_signal", signals: [] });
  });

  it("returns only fresh structured signals with their source, date, and evidence reference", () => {
    const now = Date.UTC(2026, 7, 31);
    const result = resolveReelSignals([
      { angle: "Close-up process reveal", rationale: "Higher completion on the merchant's recent posts", source: "merchant_instagram_insights", observedAt: now - 2 * 86_400_000, evidenceRef: "ig-insight:snapshot-123" },
      { angle: "Undated guess", rationale: "No proof", source: "merchant_instagram_insights", observedAt: now - 120 * 86_400_000, evidenceRef: "ig-insight:stale" },
    ], now);
    expect(result).toEqual({
      status: "available",
      signals: [expect.objectContaining({ angle: "Close-up process reveal", source: "merchant_instagram_insights", observedAt: now - 2 * 86_400_000, evidenceRef: "ig-insight:snapshot-123" })],
    });
  });
});
