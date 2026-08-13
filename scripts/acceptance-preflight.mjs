import { spawnSync } from "node:child_process";

const command = (name, args, shell = false) => {
  const result = spawnSync(name, args, { encoding: "utf8", windowsHide: true, shell });
  return { available: result.status === 0, version: `${result.stdout ?? ""}${result.stderr ?? ""}`.split(/\r?\n/).find(Boolean)?.trim() ?? null };
};

const required = {
  edge: ["CONVEX_URL", "PROOFGATE_SERVICE_SECRET", "PROOFGATE_DATA_KEY"],
  whatsapp: ["META_APP_SECRET", "META_VERIFY_TOKEN", "META_PHONE_NUMBER_ID", "META_ACCESS_TOKEN"],
  hermes: ["HERMES_ORIGIN_URL", "HERMES_PROXY_SECRET"],
  calls: ["VAPI_API_KEY", "VAPI_PHONE_NUMBER_ID", "VAPI_SQUAD_ID", "VAPI_WEBHOOK_SECRET"],
  aws: ["AWS_REGION", "AWS_RECORDINGS_BUCKET"],
};

const configuration = Object.fromEntries(Object.entries(required).map(([phase, names]) => [phase, {
  configured: names.every((name) => Boolean(process.env[name])),
  missing: names.filter((name) => !process.env[name]),
}]));
const expectedProductionConvexUrl = "https://tame-corgi-404.convex.cloud";
const productionConvexConfigured = process.env.CONVEX_URL === expectedProductionConvexUrl;
if (!productionConvexConfigured) {
  configuration.edge.configured = false;
  configuration.edge.mismatch = ["CONVEX_URL_NOT_PRODUCTION"];
}
const tools = {
  node: command(process.execPath, ["--version"]),
  ffmpeg: command("ffmpeg", ["-version"]),
  ffprobe: command("ffprobe", ["-version"]),
  hermes: command("hermes", ["--version"], process.platform === "win32"),
};
const hermesPinned = tools.hermes.available && /0\.18\.2/.test(tools.hermes.version ?? "");
const localReady = tools.node.available && tools.ffmpeg.available && tools.ffprobe.available && hermesPinned;
const providerReady = Object.values(configuration).every((phase) => phase.configured);

process.stdout.write(`${JSON.stringify({
  localReady,
  providerReady,
  liveAcceptanceReady: localReady && providerReady,
  tools,
  hermesPinned,
  configuration,
  productionConvexConfigured,
  note: "This preflight checks local tools and variable presence only; it does not prove provider ownership, webhook delivery, deployment, consent, or telecom readiness.",
}, null, 2)}\n`);
process.exitCode = localReady && providerReady ? 0 : 2;
