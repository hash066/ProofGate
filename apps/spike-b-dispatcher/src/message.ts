export function buildSpikeBMessage(acknowledgmentUrl: string): string {
  return [
    "ProofGate development Spike B",
    "",
    "You are receiving a development booking-oracle request for exactly two seats at Saturday Sessions.",
    "No payment has been requested or processed.",
    "",
    "If you are the intended external merchant or buyer and received this exact request, acknowledge it here:",
    acknowledgmentUrl,
    "",
    "The link is signed, bound to this run and recipient, and expires automatically.",
  ].join("\n");
}
