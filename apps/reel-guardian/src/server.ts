import { renderApprovedReel } from "./render";
import { runReelGuardianOnce } from "./worker";

const adminUrl = process.env.PROOFGATE_ADMIN_URL;
const serviceSecret = process.env.PROOFGATE_SERVICE_SECRET;
if (!adminUrl || !serviceSecret) throw new Error("PROOFGATE_ADMIN_URL and PROOFGATE_SERVICE_SECRET are required");
let stopping = false;
process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });
while (!stopping) {
  try {
    const result = await runReelGuardianOnce({ adminUrl, serviceSecret, render: renderApprovedReel });
    if (result.claimed) console.info(JSON.stringify({ service: "axcas-reel-guardian", ...result }));
    await new Promise((resolve) => setTimeout(resolve, result.claimed ? 1000 : 5000));
  } catch (error) {
    console.error(JSON.stringify({ service: "axcas-reel-guardian", error: error instanceof Error ? error.message : "unknown" }));
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
