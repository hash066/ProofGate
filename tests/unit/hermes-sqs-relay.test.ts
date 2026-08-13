import { describe, expect, it, vi } from "vitest";

import { createHermesSqsRelay } from "../../apps/hermes-sqs-relay/src/relay";

const signature = `sha256=${"a".repeat(64)}`;

function envelope(body = '{"object":"whatsapp_business_account"}') {
  return JSON.stringify({
    schemaVersion: 1,
    bodyBase64: Buffer.from(body).toString("base64"),
    contentType: "application/json",
    metaSignature: signature,
  });
}

describe("durable Hermes SQS relay", () => {
  it("forwards exact bytes/signature to loopback and deletes only after success", async () => {
    const send = vi.fn(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "ReceiveMessageCommand") return { Messages: [{ MessageId: "m-1", ReceiptHandle: "receipt-1", Body: envelope() }] };
      if (command.constructor.name === "DeleteMessageCommand") return {};
      throw new Error("unexpected command");
    });
    const upstreamFetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(new TextDecoder().decode(init?.body as Uint8Array)).toBe('{"object":"whatsapp_business_account"}');
      expect(new Headers(init?.headers).get("x-hub-signature-256")).toBe(signature);
      return new Response("accepted", { status: 200 });
    });
    const relay = createHermesSqsRelay({ queueUrl: "https://sqs.ap-south-1.amazonaws.com/1/relay", sqsClient: { send }, upstreamFetch });

    await expect(relay.pollOnce()).resolves.toEqual({ received: 1, delivered: 1, rejected: 0 });
    expect(upstreamFetch).toHaveBeenCalledOnce();
    expect(send.mock.calls.some(([command]) => command.constructor.name === "DeleteMessageCommand")).toBe(true);
  });

  it("retains the message when Hermes is unavailable", async () => {
    const send = vi.fn(async (command: { constructor: { name: string } }) => command.constructor.name === "ReceiveMessageCommand"
      ? { Messages: [{ MessageId: "m-2", ReceiptHandle: "receipt-2", Body: envelope() }] }
      : {});
    const relay = createHermesSqsRelay({
      queueUrl: "https://sqs.ap-south-1.amazonaws.com/1/relay",
      sqsClient: { send },
      upstreamFetch: vi.fn(async () => new Response("unavailable", { status: 503 })),
    });

    await expect(relay.pollOnce()).resolves.toEqual({ received: 1, delivered: 0, rejected: 0 });
    expect(send.mock.calls.some(([command]) => command.constructor.name === "DeleteMessageCommand")).toBe(false);
  });

  it("deletes malformed envelopes without forwarding them", async () => {
    const send = vi.fn(async (command: { constructor: { name: string } }) => command.constructor.name === "ReceiveMessageCommand"
      ? { Messages: [{ MessageId: "m-3", ReceiptHandle: "receipt-3", Body: JSON.stringify({ bodyBase64: "!!!", metaSignature: "bad" }) }] }
      : {});
    const upstreamFetch = vi.fn();
    const relay = createHermesSqsRelay({ queueUrl: "https://sqs.ap-south-1.amazonaws.com/1/relay", sqsClient: { send }, upstreamFetch });

    await expect(relay.pollOnce()).resolves.toEqual({ received: 1, delivered: 0, rejected: 1 });
    expect(upstreamFetch).not.toHaveBeenCalled();
    expect(send.mock.calls.some(([command]) => command.constructor.name === "DeleteMessageCommand")).toBe(true);
  });

  it("refuses a non-loopback Hermes target", () => {
    expect(() => createHermesSqsRelay({
      queueUrl: "https://sqs.ap-south-1.amazonaws.com/1/relay",
      upstreamUrl: "https://example.com/whatsapp/webhook",
      sqsClient: { send: vi.fn() },
    })).toThrow("loopback");
  });
});
