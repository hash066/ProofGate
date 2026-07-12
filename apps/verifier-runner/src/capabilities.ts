export const forbiddenVerifierEnvironmentKeys = [
  "CLOUDFLARE_API_TOKEN",
  "CLOUDFLARE_ACCOUNT_ID",
  "CONVEX_DEPLOY_KEY",
  "CONVEX_ADMIN_KEY",
  "DODO_API_KEY",
  "DODO_WEBHOOK_SECRET",
  "ELEVENLABS_API_KEY",
  "LINKUP_API_KEY",
  "TELEGRAM_BOT_TOKEN",
  "PROOFGATE_SERVICE_SECRET",
  "PROOFGATE_EDGE_HMAC_SECRET",
  "PROOFGATE_PROMOTION_SECRET",
] as const;

type VerifierInput = { targetUrl: string; evidenceToken?: string };

export function buildVerifierEnvironment(source: Record<string, string | undefined>, input: VerifierInput): Record<string, string> {
  const safeKeys = ["PATH", "SYSTEMROOT", "WINDIR", "COMSPEC", "TEMP", "TMP", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA"];
  const environment: Record<string, string> = {};
  for (const key of safeKeys) if (source[key]) environment[key] = source[key]!;
  environment.NODE_ENV = "production";
  environment.PROOFGATE_TARGET_URL = input.targetUrl;
  if (input.evidenceToken) environment.PROOFGATE_EVIDENCE_TOKEN = input.evidenceToken;
  return environment;
}

export function assertNoForbiddenVerifierCredentials(environment: Record<string, string | undefined>): void {
  const exposed = forbiddenVerifierEnvironmentKeys.filter((key) => Boolean(environment[key]));
  if (exposed.length) throw new Error(`Verifier refused forbidden credentials: ${exposed.join(", ")}`);
}
