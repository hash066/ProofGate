import { describe, expect, it } from "vitest";

import { convexCliInvocation } from "../../apps/spike-b-dispatcher/src/convex-cli";

describe("Convex CLI invocation", () => {
  it("launches the JavaScript entrypoint with Node instead of spawning npx.cmd", () => {
    const invocation = convexCliInvocation("C:/ProofGate", "oracle:createSpikeBSubject", { runId: "run-1" });

    expect(invocation.executable).toBe(process.execPath);
    expect(invocation.args[0]).toMatch(/node_modules[\\/]convex[\\/]bin[\\/]main\.js$/);
    expect(invocation.args.slice(1, 3)).toEqual(["run", "oracle:createSpikeBSubject"]);
    expect(JSON.parse(invocation.args[3])).toEqual({ runId: "run-1" });
  });
});
