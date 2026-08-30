import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Axcas Hermes merchant experience", () => {
  it("uses gateway correlation fields and never exposes runtime setup to merchants", async () => {
    const skill = await readFile("hermes/skills/proofgate/SKILL.md", "utf8");

    expect(skill).toContain("HERMES_SESSION_PLATFORM");
    expect(skill).toContain("HERMES_SESSION_USER_ID");
    expect(skill).toContain("HERMES_SESSION_MESSAGE_ID");
    expect(skill).toContain("I’ve saved your business details and photos");
    expect(skill).toContain("Never show environment-variable names");
    expect(skill).not.toContain("HERMES_SESSION_* correlation fields");
  });

  it("sends a real preview link and asks once for site publication", async () => {
    const skill = await readFile("hermes/skills/proofgate/SKILL.md", "utf8");
    expect(skill).toContain("exactly one approval prompt");
    expect(skill).toContain("previewUrl");
    expect(skill).toContain("Never send raw HTML");
    expect(skill).toContain("merchant supplies none of them");
  });

  it("keeps the linked Studio account synchronized after WhatsApp changes", async () => {
    const skill = await readFile("hermes/skills/proofgate/SKILL.md", "utf8");
    expect(skill).toContain("submit a fresh `intake` after every accepted business-detail change");
    expect(skill).toContain("linked Studio workspace refreshes automatically");
  });
});
