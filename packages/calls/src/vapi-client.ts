import { z } from "zod";

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

const CallResponseSchema = z.object({ id: z.string().min(1) });
const LeadSchema = z.object({ leadId: z.string().regex(/^[a-z0-9-]{3,64}$/), number: z.string().regex(/^\+[1-9]\d{7,14}$/) });

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
    const response = await fetcher("https://api.vapi.ai/call", {
      method: "POST",
      headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        squadId: input.squadId,
        phoneNumberId: input.phoneNumberId,
        customer: { number: lead.number },
        schedulePlan: { earliestAt: input.earliestAt },
        metadata: { batchId: input.batchId, leadId: lead.leadId },
      }),
    });
    if (!response.ok) throw new Error(`Vapi call creation failed for ${lead.leadId} with HTTP ${response.status}`);
    const call = CallResponseSchema.parse(await response.json());
    results.push({ leadId: lead.leadId, callId: call.id });
  }
  return results;
}
