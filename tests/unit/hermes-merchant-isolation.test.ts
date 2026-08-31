import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("merchant-facing Hermes isolation", () => {
  it("exposes only the Axcas toolset to WhatsApp", async () => {
    const config = await readFile("infra/aws/hermes-config.yaml", "utf8");

    expect(config).toContain("whatsapp: [axcas]");
    expect(config).toContain("whatsapp_cloud: [axcas]");
    expect(config).toContain("enabled: [axcas]");
    expect(config).not.toContain("whatsapp: [hermes-whatsapp]");
    expect(config).not.toContain("whatsapp_cloud: [hermes-whatsapp]");
    expect(config).not.toMatch(/whatsapp:\s*\[[^\]]*(?:terminal|file|process|execute_code|delegate)/);
  });

  it("teaches the merchant agent typed tools rather than shell commands", async () => {
    const skill = await readFile("hermes/skills/proofgate/SKILL.md", "utf8");

    expect(skill).toContain("`axcas_continue`");
    expect(skill).toContain("`axcas_status`");
    expect(skill).not.toContain("npm run proofgate");
    expect(skill).not.toContain("execute_code");
    expect(skill).not.toContain("PROOFGATE_SERVICE_SECRET");
    expect(skill).not.toContain("HERMES_SESSION_USER_ID");
  });

  it("keeps the admin credential out of the public gateway process", async () => {
    const gateway = await readFile("infra/aws/systemd/proofgate-hermes-gateway.service", "utf8");
    const bridge = await readFile("infra/aws/systemd/axcas-tool-bridge.service", "utf8");
    const install = await readFile("infra/aws/install-runtime.sh", "utf8");

    expect(gateway).toContain("EnvironmentFile=/etc/proofgate/hermes-gateway.env");
    expect(gateway).not.toContain("/etc/proofgate/hermes.env");
    expect(gateway).not.toContain("--accept-hooks");
    expect(bridge).toContain("User=axcasbridge");
    expect(bridge).toContain("EnvironmentFile=/etc/proofgate/axcas-tool-bridge.env");
    expect(bridge).toContain("RuntimeDirectory=axcas");
    expect(install).toContain("hermes/plugins/axcas");
    expect(install).toContain("axcas-tool-bridge.service");
  });

  it("fails closed on the two leaked approval-message shapes", async () => {
    const plugin = await readFile("hermes/plugins/axcas/__init__.py", "utf8");

    expect(plugin).toContain("transform_llm_output");
    expect(plugin).toContain("pre_tool_call");
    expect(plugin).toContain("SAFE_RETRY_MESSAGE");
    expect(plugin).toContain("execute_code");
    expect(plugin).toContain("npm\\s+run\\s+proofgate");
    expect(plugin).toContain("[a-fA-F0-9]{48,}");
    expect(plugin).toContain("PROOFGATE|HERMES|META|VAPI|AWS");
  });
});
