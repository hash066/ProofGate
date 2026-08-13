import { describe, expect, it, vi } from "vitest";

import { synthesizeReelVoiceover } from "../../packages/reels/src/polly";

describe("AWS Polly reel voiceover", () => {
  it("uses Kajal first and falls back to Aditi without changing the text", async () => {
    const send = vi.fn()
      .mockRejectedValueOnce(new Error("generative voice unavailable"))
      .mockResolvedValueOnce({ AudioStream: new Uint8Array([1, 2, 3]) });
    const result = await synthesizeReelVoiceover({ text: "Fresh cakes on WhatsApp.", region: "ap-south-1", client: { send } });
    expect(result).toMatchObject({ voiceId: "Aditi", engine: "standard", audio: new Uint8Array([1, 2, 3]) });
    expect(send).toHaveBeenCalledTimes(2);
    expect((send.mock.calls[0][0] as any).input).toMatchObject({ VoiceId: "Kajal", Engine: "generative", LanguageCode: "en-IN" });
    expect((send.mock.calls[1][0] as any).input).toMatchObject({ VoiceId: "Aditi", Engine: "standard", Text: "Fresh cakes on WhatsApp." });
  });
});
