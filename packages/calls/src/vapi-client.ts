import { z } from "zod";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const CallResponseSchema = z.object({ id: z.string().min(1) });
const LeadSchema = z.object({ leadId: z.string().regex(/^[a-z0-9-]{3,64}$/), number: z.string().regex(/^\+[1-9]\d{7,14}$/) });

export async function createQualificationCall(input: {
  apiKey: string; phoneNumberId: string; squadId: string; batchId: string; attemptId: string;
  earliestAt: string; lead: { leadId: string; number: string }; fetcher?: Fetcher;
}): Promise<{ attemptId: string; leadId: string; callId: string }> {
  const lead = LeadSchema.parse(input.lead);
  if (!/^[a-zA-Z0-9_.:-]{3,256}$/.test(input.attemptId) || !Number.isFinite(Date.parse(input.earliestAt))) throw new Error("invalid call attempt");
  const response = await (input.fetcher ?? fetch)("https://api.vapi.ai/call", {
    method: "POST", headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ squadId: input.squadId, phoneNumberId: input.phoneNumberId, customer: { number: lead.number }, schedulePlan: { earliestAt: input.earliestAt }, metadata: { batchId: input.batchId, leadId: lead.leadId, attemptId: input.attemptId } }),
  });
  if (!response.ok) throw new Error(`Vapi call creation failed for ${lead.leadId} with HTTP ${response.status}`);
  const call = CallResponseSchema.parse(await response.json());
  return { attemptId: input.attemptId, leadId: lead.leadId, callId: call.id };
}

export async function createQualificationCalls(input: {
  apiKey: string;
  phoneNumberId: string;
  squadId: string;
  batchId: string;
  earliestAt: string;
  leads: Array<{ leadId: string; number: string }>;
  fetcher?: Fetcher;
}): Promise<Array<{ leadId: string; callId: string }>> {
  const leads = z.array(LeadSchema).min(1).max(50).parse(input.leads);
  if (!Number.isFinite(Date.parse(input.earliestAt))) throw new Error("invalid call schedule");
  const fetcher = input.fetcher ?? fetch;
  const results: Array<{ leadId: string; callId: string }> = [];
  for (const lead of leads) {
    const result = await createQualificationCall({ ...input, attemptId: `attempt-${input.batchId}-${lead.leadId}`, lead, fetcher });
    results.push({ leadId: result.leadId, callId: result.callId });
  }
  return results;
}
