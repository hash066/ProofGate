import { describe, expect, it } from "vitest";

import { resolveWorkerBaseUrl } from "../../apps/spike-b-dispatcher/src/worker-url";

describe("Spike B Worker URL boundary", () => {
  it("requires an explicit HTTPS origin and strips a trailing slash", () => {
    expect(resolveWorkerBaseUrl("https://proofgate.example/")).toBe("https://proofgate.example");
    for (const invalid of [undefined, "http://proofgate.example", "https://user:pass@proofgate.example", "https://proofgate.example/path"]) {
      expect(() => resolveWorkerBaseUrl(invalid)).toThrow("explicit HTTPS Worker origin");
    }
  });
});
