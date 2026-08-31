import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { chmod, chown, readFile, rename, stat, writeFile } from "node:fs/promises";

const secretArn = process.env.PROOFGATE_ADMIN_SECRET_ARN;
const adminUrl = process.env.PROOFGATE_ADMIN_URL;
if (!secretArn?.startsWith("arn:")) throw new Error("PROOFGATE_ADMIN_SECRET_ARN is required");
if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev\/?$/.test(adminUrl ?? "")) throw new Error("PROOFGATE_ADMIN_URL must be the named workers.dev origin");

const response = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: secretArn }));
const serviceSecret = response.SecretString;
if (!serviceSecret || serviceSecret.length < 32 || /[\r\n]/.test(serviceSecret)) throw new Error("admin service secret is invalid");

const upsert = (text, name, value) => {
  const line = `${name}=${value}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  return pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\s*$/, "")}\n${line}\n`;
};

const syncEnvironment = async (envPath) => {
  const current = await readFile(envPath, "utf8");
  const metadata = await stat(envPath);
  const next = upsert(
    upsert(current, "PROOFGATE_ADMIN_URL", adminUrl.replace(/\/$/, "")),
    "PROOFGATE_SERVICE_SECRET",
    serviceSecret,
  );
  const temporaryPath = `${envPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, next, { mode: metadata.mode & 0o777 });
  await chmod(temporaryPath, metadata.mode & 0o777);
  await chown(temporaryPath, metadata.uid, metadata.gid);
  await rename(temporaryPath, envPath);
};

await syncEnvironment("/etc/proofgate/axcas-tool-bridge.env");
await syncEnvironment("/etc/proofgate/hermes.env");

console.info(JSON.stringify({ synced: true }));
