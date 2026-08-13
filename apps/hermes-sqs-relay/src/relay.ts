import { DeleteMessageCommand, ReceiveMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

type SqsBoundary = { send(command: unknown): Promise<unknown> };

export type HermesSqsRelayOptions = {
  queueUrl: string;
  sqsClient?: SqsBoundary;
  upstreamUrl?: string;
  upstreamFetch?: typeof fetch;
  maxBodyBytes?: number;
  timeoutMs?: number;
};

type RelayEnvelope = {
  schemaVersion: 1;
  bodyBase64: string;
  contentType: string;
  metaSignature: string;
};

function decodeEnvelope(value: string | undefined, maxBodyBytes: number): { envelope: RelayEnvelope; body: Uint8Array } | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RelayEnvelope>;
    if (parsed.schemaVersion !== 1 || typeof parsed.bodyBase64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(parsed.bodyBase64)) return null;
    if (typeof parsed.contentType !== "string" || parsed.contentType.length > 128 || !parsed.contentType.toLowerCase().startsWith("application/json")) return null;
    if (typeof parsed.metaSignature !== "string" || !/^sha256=[a-f0-9]{64}$/.test(parsed.metaSignature)) return null;
    const body = new Uint8Array(Buffer.from(parsed.bodyBase64, "base64"));
    if (body.byteLength === 0 || body.byteLength > maxBodyBytes) return null;
    return { envelope: parsed as RelayEnvelope, body };
  } catch {
    return null;
  }
}

export function createHermesSqsRelay(options: HermesSqsRelayOptions) {
  const queueUrl = new URL(options.queueUrl);
  if (queueUrl.protocol !== "https:" || !queueUrl.hostname.includes("sqs.")) throw new Error("HERMES_RELAY_QUEUE_URL must be an AWS SQS HTTPS URL");
  const upstreamUrl = new URL(options.upstreamUrl ?? "http://127.0.0.1:8090/whatsapp/webhook");
  if (upstreamUrl.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(upstreamUrl.hostname)) throw new Error("Hermes upstream must be loopback HTTP");
  const sqsClient = options.sqsClient ?? new SQSClient({});
  const upstreamFetch = options.upstreamFetch ?? fetch;
  const maxBodyBytes = options.maxBodyBytes ?? 2 * 1024 * 1024;
  const timeoutMs = options.timeoutMs ?? 15_000;

  return {
    async pollOnce(): Promise<{ received: number; delivered: number; rejected: number }> {
      const response = await sqsClient.send(new ReceiveMessageCommand({
        QueueUrl: options.queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 20,
        VisibilityTimeout: 60,
      })) as { Messages?: Array<{ Body?: string; ReceiptHandle?: string }> };
      let delivered = 0;
      let rejected = 0;
      const messages = response.Messages ?? [];
      for (const message of messages) {
        if (!message.ReceiptHandle) continue;
        const decoded = decodeEnvelope(message.Body, maxBodyBytes);
        if (!decoded) {
          rejected += 1;
          await sqsClient.send(new DeleteMessageCommand({ QueueUrl: options.queueUrl, ReceiptHandle: message.ReceiptHandle }));
          continue;
        }
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const upstream = await upstreamFetch(upstreamUrl, {
            method: "POST",
            headers: {
              "content-type": decoded.envelope.contentType,
              "x-hub-signature-256": decoded.envelope.metaSignature,
            },
            body: new Uint8Array(Array.from(decoded.body)).buffer,
            signal: controller.signal,
          });
          if (upstream.ok) {
            await sqsClient.send(new DeleteMessageCommand({ QueueUrl: options.queueUrl, ReceiptHandle: message.ReceiptHandle }));
            delivered += 1;
          }
        } catch {
          // Leave the message for SQS retry and eventual dead-lettering.
        } finally {
          clearTimeout(timeout);
        }
      }
      return { received: messages.length, delivered, rejected };
    },
  };
}
