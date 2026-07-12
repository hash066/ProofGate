import { describe, expect, it } from "vitest";

import { buildVerifierEnvironment, forbiddenVerifierEnvironmentKeys } from "../../apps/verifier-runner/src/capabilities";

describe("verifier capability boundary", () => {
  it("does not pass mutation, deployment, provider, payment, or promotion credentials", () => {
    const source = {
      PATH: "C:/bin",
      SYSTEMROOT: "C:/Windows",
      CLOUDFLARE_API_TOKEN: "secret",
      CONVEX_DEPLOY_KEY: "secret",
      DODO_API_KEY: "secret",
      ELEVENLABS_API_KEY: "secret",
      PROOFGATE_SERVICE_SECRET: "secret",
      PROOFGATE_PROMOTION_SECRET: "secret",
    };

    const result = buildVerifierEnvironment(source, {
      targetUrl: "https://public.example/s/site",
      evidenceToken: "one-use-token",
    });

    expect(result.PROOFGATE_TARGET_URL).toBe("https://public.example/s/site");
    expect(result.PROOFGATE_EVIDENCE_TOKEN).toBe("one-use-token");
    for (const key of forbiddenVerifierEnvironmentKeys) expect(result[key]).toBeUndefined();
  });
});
