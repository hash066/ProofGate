import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

type PollySender = { send: (command: SynthesizeSpeechCommand) => Promise<{ AudioStream?: any }> };

export const proofGateVoices = [
  { voiceId: "Kajal", engine: "generative" },
  { voiceId: "Aditi", engine: "standard" },
] as const;

async function audioBytes(stream: any): Promise<Uint8Array> {
  if (!stream) throw new Error("Polly returned no audio stream");
  if (typeof stream.transformToByteArray === "function") return new Uint8Array(await stream.transformToByteArray());
  if (stream instanceof Uint8Array) return stream;
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) chunks.push(new Uint8Array(chunk));
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
  return output;
}

export async function synthesizeReelVoiceover(input: {
  text: string;
  region: string;
  client?: PollySender;
}): Promise<{ audio: Uint8Array; voiceId: "Kajal" | "Aditi"; engine: "generative" | "standard" }> {
  const text = input.text.trim();
  if (!text || text.length > 1500) throw new Error("voiceover must be between 1 and 1500 characters");
  const client = input.client ?? new PollyClient({ region: input.region });
  let lastError: unknown;
  for (const candidate of proofGateVoices) {
    try {
      const response = await client.send(new SynthesizeSpeechCommand({
        Text: text,
        OutputFormat: "mp3",
        VoiceId: candidate.voiceId,
        Engine: candidate.engine,
        LanguageCode: "en-IN",
      }));
      return { audio: await audioBytes(response.AudioStream), ...candidate };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`AWS Polly voiceover failed: ${lastError instanceof Error ? lastError.message : "unknown provider error"}`);
}
