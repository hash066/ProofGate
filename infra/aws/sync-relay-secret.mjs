import { readFile } from "node:fs/promises";
import { PutSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

const secretArn = process.env.HERMES_RELAY_SECRET_ARN;
if (!secretArn?.startsWith("arn:")) throw new Error("HERMES_RELAY_SECRET_ARN is required");
const envText = await readFile("/etc/proofgate/origin.env", "utf8");
const value = envText.match(/^HERMES_PROXY_SECRET=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, "");
if (!value || value.length < 32) throw new Error("existing HERMES_PROXY_SECRET is unavailable");

await new SecretsManagerClient({}).send(new PutSecretValueCommand({ SecretId: secretArn, SecretString: value }));
console.info(JSON.stringify({ synced: true, secretArn }));
