import { createHermesSqsRelay } from "./relay";

const queueUrl = process.env.HERMES_RELAY_QUEUE_URL;
if (!queueUrl) throw new Error("HERMES_RELAY_QUEUE_URL is required");

const relay = createHermesSqsRelay({ queueUrl, upstreamUrl: process.env.HERMES_UPSTREAM_URL });
let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

while (!stopping) {
  try {
    const result = await relay.pollOnce();
    if (result.delivered || result.rejected) console.info(JSON.stringify({ service: "proofgate-hermes-relay", ...result }));
  } catch (error) {
    console.error(JSON.stringify({ service: "proofgate-hermes-relay", error: error instanceof Error ? error.message : "unknown relay error" }));
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}
