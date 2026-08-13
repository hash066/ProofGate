import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("AWS Hermes runtime assets", () => {
  it("installs an operator-owned runtime without embedding customer credentials", async () => {
    const script = await readFile("infra/aws/install-runtime.sh", "utf8");
    expect(script).toContain('REPOSITORY_URL="${1:?');
    expect(script).toContain('REPOSITORY_COMMIT="${2:?');
    expect(script).toMatch(/git .* checkout --detach/);
    expect(script).toMatch(/npm .* ci --ignore-scripts/);
    expect(script).toContain("hermes/skills/proofgate");
    expect(script).not.toMatch(/customer.*(?:api.?key|access.?token)/i);
    expect(script).not.toContain("git checkout main");
  });

  it("runs the authenticated origin on loopback under systemd", async () => {
    const unit = await readFile("infra/aws/systemd/proofgate-hermes-origin.service", "utf8");
    expect(unit).toContain("User=proofgate");
    expect(unit).toContain("EnvironmentFile=/etc/proofgate/origin.env");
    expect(unit).toContain("PROOFGATE_ORIGIN_HOST=127.0.0.1");
    expect(unit).toContain("@proofgate/hermes-origin-proxy");
    expect(unit).toContain("NoNewPrivileges=true");
  });

  it("keeps AWS ingress closed and exposes deployment outputs", async () => {
    const template = await readFile("infra/aws/cloudformation.yaml", "utf8");
    expect(template).not.toContain("SecurityGroupIngress");
    expect(template).toContain("InstanceId:");
    expect(template).toContain("RecordingsBucketName:");
    expect(template).toContain("AWSRegion:");
    expect(template).toContain("cloudflared/releases/download/2026.7.3/cloudflared-linux-amd64");
    expect(template).toContain("9d71c677db00134c1bd4144b7783486b654ad281b1ea62b4972098d19f770f17");
  });

  it("runs the named tunnel from a root-readable token file", async () => {
    const unit = await readFile("infra/aws/systemd/proofgate-cloudflared.service", "utf8");
    expect(unit).toContain("--token-file /etc/proofgate/cloudflared-token");
    expect(unit).toContain("After=network-online.target proofgate-hermes-origin.service");
    expect(unit).not.toMatch(/eyJ[A-Za-z0-9._-]{80,}/);
  });

  it("provides a fail-closed one-command AWS deployment", async () => {
    const deploy = await readFile("infra/aws/deploy.ps1", "utf8");
    expect(deploy).toContain("aws sts get-caller-identity");
    expect(deploy).toContain("aws cloudformation validate-template");
    expect(deploy).toContain("aws cloudformation deploy");
    expect(deploy).toContain("aws ssm send-command");
    expect(deploy).toContain("aws ssm wait command-executed");
    expect(deploy).toContain("raw.githubusercontent.com");
    expect(deploy).not.toMatch(/customer.*(?:api.?key|access.?token)/i);
  });
});
