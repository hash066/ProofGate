import { z } from "zod";

export const ReelSignalSchema = z.object({
  angle: z.string().trim().min(1).max(160),
  rationale: z.string().trim().min(1).max(300),
  source: z.enum(["merchant_instagram_insights", "merchant_campaign_metrics", "merchant_uploaded_reference"]),
  observedAt: z.number().int().nonnegative(),
  evidenceRef: z.string().trim().min(3).max(300),
});

export type ReelSignal = z.infer<typeof ReelSignalSchema>;
export type ReelSignalResolution =
  | { status: "insufficient_signal"; signals: [] }
  | { status: "available"; signals: ReelSignal[] };

const MAX_SIGNAL_AGE_MS = 45 * 86_400_000;
const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export function resolveReelSignals(input: unknown[], now: number): ReelSignalResolution {
  if (!Number.isFinite(now) || now < 0) throw new Error("signal evaluation time is invalid");
  const byEvidence = new Map<string, ReelSignal>();
  for (const candidate of input) {
    const parsed = ReelSignalSchema.safeParse(candidate);
    if (!parsed.success) continue;
    if (parsed.data.observedAt < now - MAX_SIGNAL_AGE_MS || parsed.data.observedAt > now + MAX_CLOCK_SKEW_MS) continue;
    const prior = byEvidence.get(parsed.data.evidenceRef);
    if (!prior || parsed.data.observedAt > prior.observedAt) byEvidence.set(parsed.data.evidenceRef, parsed.data);
  }
  const signals = [...byEvidence.values()].sort((left, right) => right.observedAt - left.observedAt).slice(0, 3);
  return signals.length ? { status: "available", signals } : { status: "insufficient_signal", signals: [] };
}
