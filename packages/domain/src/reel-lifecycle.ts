export const REEL_LIFECYCLE_STATUSES = [
  "draft",
  "approved",
  "rendering",
  "rendered",
  "delivering",
  "delivered",
  "delivery_failed",
] as const;

export type ReelLifecycleStatus = typeof REEL_LIFECYCLE_STATUSES[number];
export type ReelLifecycleEvent = "approve" | "claim_render" | "render_succeeded" | "begin_delivery" | "delivery_succeeded" | "delivery_failed";

const transitions: Record<ReelLifecycleEvent, { from: ReelLifecycleStatus[]; to: ReelLifecycleStatus }> = {
  approve: { from: ["draft"], to: "approved" },
  claim_render: { from: ["approved"], to: "rendering" },
  render_succeeded: { from: ["rendering"], to: "rendered" },
  begin_delivery: { from: ["rendered"], to: "delivering" },
  delivery_succeeded: { from: ["delivering"], to: "delivered" },
  delivery_failed: { from: ["rendering", "delivering"], to: "delivery_failed" },
};

export function transitionReelLifecycle(status: ReelLifecycleStatus, event: ReelLifecycleEvent): { status: ReelLifecycleStatus; applied: boolean } {
  const transition = transitions[event];
  if (status === transition.to) return { status, applied: false };
  if (!transition.from.includes(status)) throw new Error(`invalid reel transition: ${status} -> ${event}`);
  return { status: transition.to, applied: true };
}
