import { describe, expect, it } from "vitest";

import { buildSpikeBMessage } from "../../apps/spike-b-dispatcher/src/message";

describe("Spike B external dispatch message", () => {
  it("states the exact development request and acknowledgment action without payment claims", () => {
    const message = buildSpikeBMessage("https://proofgate.example/ack?token=redacted");

    expect(message).toContain("development Spike B");
    expect(message).toContain("exactly two seats");
    expect(message).toContain("https://proofgate.example/ack?token=redacted");
    expect(message).toContain("No payment");
    expect(message).not.toContain("paid");
    expect(message).not.toContain("production certified");
  });
});
