type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type CallGuardianResult = {
  claimed: boolean;
  batchId?: string;
  calls?: Array<{ leadId: string; callId: string }>;
  blocked?: string;
};

export async function runCallGuardianOnce(options: {
  adminUrl: string;
  serviceSecret: string;
  fetcher?: Fetcher;
}): Promise<CallGuardianResult> {
  const origin = new URL(options.adminUrl);
  if (origin.protocol !== "https:" || options.serviceSecret.length < 32) throw new Error("call guardian configuration is invalid");
  const response = await (options.fetcher ?? fetch)(`${origin.origin}/internal/guardian`, {
    method: "POST",
    headers: { authorization: `Bearer ${options.serviceSecret}`, "content-type": "application/json" },
    body: JSON.stringify({ kind: "calls" }),
  });
  if (!response.ok) throw new Error(`call guardian request failed with HTTP ${response.status}`);
  return await response.json() as CallGuardianResult;
}
