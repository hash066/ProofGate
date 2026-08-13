import { describe, expect, it } from "vitest";

import { initialReelPlan, reelDurationSeconds, validateRenderInputs } from "../../apps/reel-worker/src/render";

describe("reel renderer", () => {
  it("pins the approved vertical-video format and exact scene duration", () => {
    expect(reelDurationSeconds(initialReelPlan)).toBe(15);
    expect(validateRenderInputs(initialReelPlan, {
      "cake-1": "C:/proofgate/assets/cake-1.jpg",
      "cake-2": "C:/proofgate/assets/cake-2.jpg",
      "cake-3": "C:/proofgate/assets/cake-3.jpg",
    }, "C:/proofgate/assets")).toEqual([
      "C:\\proofgate\\assets\\cake-1.jpg",
      "C:\\proofgate\\assets\\cake-2.jpg",
      "C:\\proofgate\\assets\\cake-3.jpg",
    ]);
  });

  it("rejects unapproved assets and path traversal", () => {
    expect(() => validateRenderInputs(initialReelPlan, { "cake-1": "C:/outside/secret.jpg" }, "C:/proofgate/assets")).toThrow();
  });
});
