import { z } from "zod";

export const ReelRenderEvidenceSchema = z.object({
  ffprobe: z.object({
    width: z.literal(1080),
    height: z.literal(1920),
    videoCodec: z.literal("h264"),
    audioCodec: z.literal("aac"),
    durationSeconds: z.number().finite().min(12).max(18),
    inspectedAt: z.number().int().nonnegative().optional(),
  }),
  polly: z.object({
    voiceId: z.enum(["Kajal", "Aditi"]),
    engine: z.enum(["generative", "standard"]),
    characters: z.number().int().min(1).max(1500),
    providerRequestId: z.string().min(1).max(256).optional(),
    synthesizedAt: z.number().int().nonnegative().optional(),
  }).superRefine((receipt, context) => {
    if ((receipt.voiceId === "Kajal") !== (receipt.engine === "generative")) {
      context.addIssue({ code: "custom", message: "Polly voice and engine receipt do not match" });
    }
  }),
});

export type ReelRenderEvidence = z.infer<typeof ReelRenderEvidenceSchema>;
