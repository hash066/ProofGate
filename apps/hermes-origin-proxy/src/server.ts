import { createServer } from "node:http";

import { createHermesOriginProxy } from "./proxy";

const proxySecret = process.env.HERMES_PROXY_SECRET ?? "";
const host = process.env.PROOFGATE_ORIGIN_HOST ?? "127.0.0.1";
const port = Number(process.env.PROOFGATE_ORIGIN_PORT ?? "8080");
const maxBodyBytes = Number(process.env.PROOFGATE_ORIGIN_MAX_BODY_BYTES ?? `${2 * 1024 * 1024}`);

if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("PROOFGATE_ORIGIN_PORT is invalid");
if (!Number.isInteger(maxBodyBytes) || maxBodyBytes < 1) throw new Error("PROOFGATE_ORIGIN_MAX_BODY_BYTES is invalid");

const handle = createHermesOriginProxy({
  proxySecret,
  upstreamUrl: process.env.HERMES_UPSTREAM_URL,
  maxBodyBytes,
});

const server = createServer(async (incoming, outgoing) => {
  try {
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of incoming) {
      const bytes = Buffer.from(chunk);
      received += bytes.byteLength;
      if (received > maxBodyBytes) {
        outgoing.writeHead(413, { "content-type": "text/plain; charset=utf-8" });
        outgoing.end("Payload too large");
        return;
      }
      chunks.push(bytes);
    }
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://${host}:${port}${incoming.url ?? "/"}`, {
      method: incoming.method,
      headers: incoming.headers as HeadersInit,
      body,
    });
    const response = await handle(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch {
    outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end("Internal error");
  }
});

server.listen(port, host, () => {
  process.stdout.write(`ProofGate Hermes origin listening on http://${host}:${port}\n`);
});

const shutdown = () => server.close(() => process.exit(0));
process.once("SIGTERM", shutdown);
process.once("SIGINT", shutdown);
