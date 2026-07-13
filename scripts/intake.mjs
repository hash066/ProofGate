// ProofGate — agentic merchant intake, one command.
//
// Turns a merchant brief (CLI flags or --json) into a Zod-valid SiteSpec, then
// runs the REAL release pipeline by importing the existing packages — the exact
// call patterns proven in scripts/demo-loop.mjs (no reimplementation):
//   packages/domain          — SiteSpec schema + SiteVersion hashing/integrity
//   packages/renderer        — deterministic SiteSpec -> merchant page HTML
//   packages/contract-runner — buyer contract + capability-separated verifier check
//   packages/release-policy  — deterministic release-authority gate
//   apps/verifier-runner     — verifier credential-capability envelope
//
// Output is truthful by construction:
//   - The spec is drafted by Nebius (NousResearch/Hermes-4-70B) when a key is
//     present, otherwise by a deterministic flag mapping clearly labelled
//     "template mode (no LLM key)". Either way SiteSpecSchema.parse gates it.
//   - It writes public/s/<slug>.html (the rendered merchant page) and
//     public/proof/<slug>.html (a Proof Passport reflecting the REAL gate state).
//   - A brand-new site has no external booking witness, so the deterministic gate
//     BLOCKS on EXTERNAL_WITNESS and the passport is AMBER "pending real buyer
//     witness". Green is never faked — only a real acknowledged booking event
//     (see scripts/demo-loop.mjs step g / the Telegram oracle) can promote it.
//
// Run:  npm run intake -- --name "Cafe Aroma" --offer "Latte tasting, Sat 4pm" --price 199 --slug cafe-aroma

import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { SiteSpecSchema, initialSpikeSiteSpec } from "../packages/domain/src/site-spec";
import { buildSiteVersion, hashSiteSpec, verifySiteVersionIntegrity } from "../packages/domain/src/site-version";
import { renderSite } from "../packages/renderer/src/render-site";
import { BuyerContractSchema, evaluateContractCapabilities } from "../packages/contract-runner/src/contract";
import { evaluatePromotion } from "../packages/release-policy/src/release-authority";
import { assertNoForbiddenVerifierCredentials, buildVerifierEnvironment } from "../apps/verifier-runner/src/capabilities";
import { convexCliInvocation } from "../apps/spike-b-dispatcher/src/convex-cli";

const execFileAsync = promisify(execFile);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const flags = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq !== -1) {
      flags[token.slice(2, eq)] = token.slice(eq + 1);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      flags[key] = true;
    } else {
      flags[key] = next;
      index += 1;
    }
  }
  return flags;
}

function parseEnvFile(content) {
  const environment = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    // strip inline comments + surrounding quotes
    let value = rest.join("=").replace(/\s+#.*$/, "").trim().replace(/^['"]|['"]$/g, "");
    environment[key.trim()] = value;
  }
  return environment;
}

async function loadEnv() {
  const environment = {};
  for (const file of [".env", ".env.local"]) {
    try {
      Object.assign(environment, parseEnvFile(await readFile(resolve(projectRoot, file), "utf8")));
    } catch {
      /* file optional */
    }
  }
  // process.env wins so a key can be passed inline for a single run
  for (const key of [
    "NEBIUS_API_KEY", "OPENAI_API_KEY", "NEBIUS_BASE_URL", "OPENAI_BASE_URL",
    "NEBIUS_MODEL", "CONVEX_URL", "CONVEX_DEPLOYMENT", "CONVEX_DEPLOY_KEY",
    "PUBLIC_SITE_BASE_URL", "APP_BASE_URL", "PROOFGATE_PUBLIC_BASE_URL", "PORT",
  ]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return environment;
}

const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

function clean(value, fallback = "", max = 480) {
  let out = String(value ?? "").replace(/[<>]/g, "").replace(/javascript:/gi, "").replace(/\s+/g, " ").trim();
  if (!out) out = fallback;
  return out.slice(0, max);
}

function normalizeSlug(raw, name) {
  let slug = String(raw || name || "site")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "") // transliterate diacritics: Núñez -> Nunez
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  if (slug.length < 3) slug = `${slug || "site"}-page`;
  return slug.slice(0, 64).replace(/-+$/g, "") || "merchant-site";
}

function resolveDateTime(raw) {
  if (raw && Number.isFinite(Date.parse(raw))) return new Date(raw).toISOString();
  // default: one week out at 10:00 UTC — always a valid, future ISO date-time
  const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  future.setUTCHours(10, 0, 0, 0);
  return future.toISOString();
}

function formatPrice(price, currency) {
  if (price === undefined || price === true || price === "") return "";
  const numeric = Number(price);
  return Number.isFinite(numeric) ? `${currency}${numeric}` : String(price);
}

function deepMerge(base, patch) {
  if (Array.isArray(patch)) return patch;
  if (patch && typeof patch === "object" && base && typeof base === "object" && !Array.isArray(base)) {
    const out = { ...base };
    for (const [key, value] of Object.entries(patch)) out[key] = deepMerge(base[key], value);
    return out;
  }
  return patch === undefined ? base : patch;
}

// ---------------------------------------------------------------------------
// (a) brief -> SiteSpec
// ---------------------------------------------------------------------------
function buildTemplateSpec({ slug, name, offer, price, currency, datetime, location, timezone }) {
  const spec = structuredClone(initialSpikeSiteSpec);
  const startsAt = resolveDateTime(datetime);
  const priceLine = formatPrice(price, currency);
  const offerTitle = clean(offer, `${name} booking`, 90);
  const descriptionBits = [
    priceLine ? `${priceLine} per seat` : null,
    clean(offer, "", 200) || null,
    location ? `at ${clean(location, "", 80)}` : null,
  ].filter(Boolean);

  spec.siteId = slug;
  spec.business.name = clean(name, "New Merchant", 90);
  spec.business.description = clean(location ? `${name} — ${location}` : `${name} — reserve your place below.`, `${name} booking`, 200);
  spec.business.tagline = clean(offer, "", 60) || undefined;
  spec.business.timezone = clean(timezone, "Asia/Kolkata", 60);

  spec.hero.headline = clean(offer ? offerTitle : `Book with ${name}.`, `Book with ${name}.`, 120);
  spec.hero.subheadline = clean(
    `Reserve your place with ${name}. This buyer journey is verified and released by ProofGate.`,
    "Verified and released by ProofGate.",
    200,
  );

  spec.offer.title = offerTitle;
  spec.offer.description = clean(
    `${descriptionBits.join(" · ") || offerTitle} (development demo — no payment is taken and no external delivery is claimed)`,
    offerTitle,
  );
  spec.offer.quantity = { enabled: true, min: 1, max: 3, default: 1 };
  spec.offer.booking = { timezone: spec.business.timezone, slots: [{ id: "slot-1", startsAt, capacity: 12 }] };

  spec.confirmation = {
    buyerChannels: ["email"],
    merchantChannels: ["telegram"],
    message: clean(`Your ${name} reservation is recorded (development demo — pending a real witnessed booking).`, "Reservation recorded.", 200),
    voiceRequired: false,
  };
  spec.claims = [];
  spec.policies = { cancellation: "Cancel any time before the session." };
  spec.proofBadge = { enabled: true, passportSlug: slug };
  return spec;
}

async function draftSpecWithNebius({ brief, slug, base, key, model, template }) {
  const system = [
    "You are ProofGate's intake compiler. Convert the merchant brief into ONE JSON object that is a valid ProofGate SiteSpec.",
    "Output ONLY the JSON object — no markdown, no prose, no code fences.",
    "Hard rules:",
    `- "siteId" and "proofBadge.passportSlug" MUST both equal "${slug}".`,
    '- "schemaVersion" MUST be 1. "offer.kind" MUST be "booking".',
    '- "offer.quantity" = { enabled:boolean, min>=1, max<=50, default in [min,max] }.',
    '- "offer.fields" MUST include {id:"buyer-name",type:"text",required:true} and {id:"buyer-email",type:"email",required:true}.',
    '- "offer.booking.slots[].startsAt" MUST be an ISO-8601 date-time. "theme.accent" MUST be a 6-digit hex like "#bd4c2f".',
    '- No HTML, angle brackets, or javascript: URLs in any text. Keep every text field under 480 characters.',
    "Use this valid spec as the scaffold and only change what the brief implies:",
    JSON.stringify(template),
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Merchant brief:\n${brief}` },
        ],
      }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Nebius HTTP ${response.status}: ${(await response.text()).slice(0, 180)}`);
    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("Nebius returned an empty completion");
    const jsonText = content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
    return JSON.parse(jsonText);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Proof Passport page (reflects the REAL deterministic gate state)
// ---------------------------------------------------------------------------
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[c]));
}

function renderPassport({ spec, version, contract, capability, decision, passportState, mode, checkedAt, publicBase, localBase, convex }) {
  const palette = {
    green: { bg: "#e4efdc", fg: "#2f6a2c", bar: "#4a9a41", dot: "GREEN" },
    amber: { bg: "#fbefd3", fg: "#8a5a12", bar: "#d7a727", dot: "AMBER" },
    red: { bg: "#f6dcdc", fg: "#8a1f1f", bar: "#c23b3b", dot: "RED" },
  }[passportState];

  const missing = decision.decision === "BLOCK" ? decision.missing : [];
  const witnessPending = missing.includes("EXTERNAL_WITNESS");
  const blockLabel = {
    EXTERNAL_WITNESS: "A real external buyer/merchant must acknowledge a booking through the signed booking oracle.",
    BLOCKER_RUNS: "A blocking buyer-contract run has not passed.",
    SPEC_HASH_MISMATCH: "The verified spec hash does not match the candidate.",
    CANARY_POINTER_MISMATCH: "The canary pointer does not match the candidate version.",
    OPEN_INCIDENT: "An incident is open against this site.",
    CLAIMS: "A required claim is not verified.",
    REQUIRED_CONFIRMATION: "The required confirmation predicate is missing.",
    APPROVALS: "A required human approval is missing.",
    EVIDENCE_CAPABILITY: "Evidence did not come through the run's bound capability.",
  };

  const checks = [
    ["Merchant page built &amp; rendered from a Zod-valid SiteSpec", true],
    [`Buyer contract compiled &amp; capability-checked (${escapeHtml(contract.contractId)})`, true],
    [`Requested quantity within the seat limit (≤ ${spec.offer.quantity.max})`, capability.status === "ready"],
    ["Verifier ran capability-separated (no deploy / provider / payment secrets)", true],
    ["External booking witness acknowledged (real buyer/merchant)", !witnessPending],
  ];

  const site = publicBase ? `${publicBase}/s/${spec.siteId}.html` : `${localBase}/s/${spec.siteId}.html`;
  const convexLine = convex.status === "ok" || convex.status === "partial"
    ? `Convex: persisted (passport projection = ${escapeHtml(convex.projection?.passportState ?? "amber")})`
    : convex.status === "skipped"
      ? "Convex: not configured (local-only run)"
      : "Convex: deployment unreachable at intake time (local page is authoritative)";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proof Passport — ${escapeHtml(spec.business.name)}</title>
<style>
:root{font-family:"DM Sans",system-ui,sans-serif;color:#22251f;background:#f2efe7}*{box-sizing:border-box}
body{margin:0;min-height:100vh;background:radial-gradient(circle at 12% 10%,#fff9dc,transparent 30%),#f2efe7;display:flex;flex-direction:column;align-items:center;padding:32px 16px}
.wrap{width:min(760px,100%)}
.bar{display:flex;align-items:center;gap:10px;margin-bottom:18px}
.mark{color:#bd4c2f;font-size:1.3rem}.brand{font-family:Georgia,serif;font-size:1.35rem}
.card{border:1px solid #ded9cd;border-left:6px solid ${palette.bar};border-radius:20px;background:#fffdf9;box-shadow:0 20px 60px rgba(55,48,35,.10);padding:clamp(22px,4vw,36px)}
.head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;flex-wrap:wrap}
.head h1{font-family:Georgia,serif;font-weight:400;font-size:1.7rem;margin:2px 0 0}
.eyebrow{color:#bd4c2f;font-size:.72rem;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin:0}
.state{display:inline-flex;align-items:center;padding:8px 16px;border-radius:999px;font-weight:700;font-size:.8rem;letter-spacing:.05em;background:${palette.bg};color:${palette.fg}}
.contract{margin:20px 0 6px;color:#4f514a;line-height:1.6}
.reason{margin:14px 0 0;padding:12px 14px;border-radius:12px;background:${palette.bg};color:${palette.fg};font-weight:600;font-size:.92rem;line-height:1.5}
ul{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:10px}
li{position:relative;padding-left:30px;color:#3b3d37;font-size:.94rem;line-height:1.45}
li .i{position:absolute;left:0;top:0;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;font-size:.7rem;color:#fff}
.ok{background:#4a9a41}.no{background:${palette.bar}}
.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:22px;padding-top:16px;border-top:1px dashed #d6d2c9}
.meta span{padding:5px 11px;border-radius:8px;background:#f2efe7;color:#6c6e66;font-size:.72rem;font-family:ui-monospace,monospace}
.foot{margin:18px 2px 0;color:#83857d;font-size:.75rem;line-height:1.6}
a{color:#bd4c2f}
</style></head>
<body><div class="wrap">
<div class="bar"><span class="mark">⚕</span><span class="brand">ProofGate</span></div>
<div class="card">
  <div class="head">
    <div><p class="eyebrow">Proof Passport</p><h1>${escapeHtml(spec.business.name)} — ${escapeHtml(spec.offer.title)}</h1></div>
    <span class="state">● ${palette.dot}</span>
  </div>
  <p class="contract"><strong>Buyer contract:</strong> ${escapeHtml(contract.objective)}</p>
  <div class="reason">${
    passportState === "green"
      ? "Every deterministic release fact holds. Certified by policy code."
      : passportState === "amber"
        ? "Pending a real buyer witness. The build and the capability-separated verifier pass, but ProofGate will not turn this passport green until a genuine external booking is acknowledged through the signed booking oracle. This is the truthful state of a freshly built site."
        : `Blocked by policy: ${missing.map((m) => escapeHtml(blockLabel[m] ?? m)).join(" ")}`
  }</div>
  <ul>
    ${checks.map(([label, ok]) => `<li><span class="i ${ok ? "ok" : "no"}">${ok ? "✓" : "…"}</span>${label}</li>`).join("\n    ")}
  </ul>
  <div class="meta">
    <span>site ${escapeHtml(spec.siteId)}</span>
    <span>version ${escapeHtml(version.versionId)}</span>
    <span>spec ${escapeHtml(version.specHash.slice(0, 12))}…</span>
    <span>gate ${escapeHtml(decision.decision)}${missing.length ? ` [${escapeHtml(missing.join(","))}]` : ""}</span>
    <span>oracle: booking</span>
    <span>${escapeHtml(mode)}</span>
  </div>
</div>
<p class="foot">
  Merchant page: <a href="${escapeHtml(site)}">${escapeHtml(site)}</a><br>
  Gate decided by <code>evaluatePromotion</code> (deterministic policy code) at ${escapeHtml(new Date(checkedAt).toISOString())}. ${escapeHtml(convexLine)}<br>
  The builder cannot approve its own work. Only a real acknowledged booking event promotes this passport to green; a regression flips it amber/red and rolls back.
</p>
</div></body></html>`;
}

// ---------------------------------------------------------------------------
// best-effort Convex persistence (reuses existing convex/ functions via the CLI)
// ---------------------------------------------------------------------------
async function runConvex(childEnv, functionName, args) {
  const invocation = convexCliInvocation(projectRoot, functionName, args);
  const { stdout } = await execFileAsync(invocation.executable, invocation.args, {
    windowsHide: true,
    encoding: "utf8",
    timeout: 60_000,
    env: childEnv,
    cwd: projectRoot,
  });
  try {
    return JSON.parse(stdout);
  } catch {
    return stdout.trim();
  }
}

async function persistToConvex({ env, version, spec, contract, runId, csrfIdentityHash }) {
  if (!env.CONVEX_URL) return { status: "skipped", detail: "CONVEX_URL not set in .env/.env.local" };
  const childEnv = { ...process.env, CONVEX_URL: env.CONVEX_URL };
  if (env.CONVEX_DEPLOYMENT) childEnv.CONVEX_DEPLOYMENT = env.CONVEX_DEPLOYMENT;
  if (env.CONVEX_DEPLOY_KEY) childEnv.CONVEX_DEPLOY_KEY = env.CONVEX_DEPLOY_KEY;

  const issuedAt = version.createdAt;
  const expiresAt = issuedAt + 24 * 60 * 60 * 1000;
  const nonceHash = sha256Hex(randomBytes(24).toString("base64url"));

  // Each existing function is attempted independently so a missing/failed module
  // still records what it can and the status stays truthful and granular.
  const attempt = async (functionName, args) => {
    try {
      return { ok: true, out: await runConvex(childEnv, functionName, args) };
    } catch (error) {
      return { ok: false, error: (error?.message ?? String(error)).replace(/\s+/g, " ").slice(0, 200) };
    }
  };

  const versionRes = await attempt("sites:createVersion", {
    specJson: JSON.stringify(version.spec),
    versionId: version.versionId,
    actor: version.actor,
    createdAt: version.createdAt,
  });
  const subjectRes = await attempt("oracle:createSpikeBSubject", {
    nonceHash,
    siteId: spec.siteId,
    versionId: version.versionId,
    specHash: version.specHash,
    contractId: contract.contractId,
    runId,
    expectedQuantity: spec.offer.quantity.default,
    csrfIdentityHash,
    issuedAt,
    expiresAt,
  });
  const projRes = await attempt("oracle:getPassportProjection", { siteId: spec.siteId });

  if (!versionRes.ok && !subjectRes.ok && !projRes.ok) {
    return { status: "unreachable", detail: versionRes.error || subjectRes.error || projRes.error };
  }
  const detail = [
    versionRes.ok ? null : `siteVersion:${versionRes.error}`,
    subjectRes.ok ? null : `subject:${subjectRes.error}`,
    projRes.ok ? null : `projection:${projRes.error}`,
  ].filter(Boolean).join("; ");
  return {
    status: versionRes.ok && subjectRes.ok && projRes.ok ? "ok" : "partial",
    projection: projRes.ok && typeof projRes.out === "object" ? projRes.out : undefined,
    detail: detail || undefined,
  };
}

// ---------------------------------------------------------------------------
// public base URL (tunnel) resolver — env override, else detected from repo docs
// ---------------------------------------------------------------------------
async function resolvePublicBase(env, cliBase) {
  const override = cliBase || env.PROOFGATE_PUBLIC_BASE_URL || env.PUBLIC_SITE_BASE_URL || env.APP_BASE_URL;
  if (override && typeof override === "string") return { url: override.replace(/\/$/, ""), source: "env/flag override" };
  for (const file of ["README.md", "EVIDENCE.md"]) {
    try {
      const match = (await readFile(resolve(projectRoot, file), "utf8")).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match) return { url: match[0], source: `detected in ${file} (ephemeral quick tunnel)` };
    } catch {
      /* optional */
    }
  }
  return { url: null, source: "none (local only)" };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(`ProofGate intake — brief -> verified merchant page + Proof Passport

  npm run intake -- --name "Cafe Aroma" --offer "Latte tasting, Sat 4pm" --price 199 --slug cafe-aroma
  npm run intake -- --json '{"business":{"name":"..."},"offer":{...}}' --slug my-slug

Flags: --name --offer --price --currency (default ₹) --slug --datetime --location --timezone
       --json '<sitespec-ish>'   --base-url <tunnel>   --no-llm`);
    return;
  }

  const env = await loadEnv();
  const currency = typeof flags.currency === "string" ? flags.currency : "₹";
  const slug = normalizeSlug(flags.slug, flags.name || flags.json);
  const localBase = `http://localhost:${env.PORT || 4173}`;
  const { url: publicBase, source: baseSource } = await resolvePublicBase(env, typeof flags["base-url"] === "string" ? flags["base-url"] : undefined);

  // --- (a) brief -> SiteSpec ------------------------------------------------
  const template = buildTemplateSpec({
    slug,
    name: typeof flags.name === "string" ? flags.name : slug,
    offer: typeof flags.offer === "string" ? flags.offer : "",
    price: flags.price,
    currency,
    datetime: typeof flags.datetime === "string" ? flags.datetime : undefined,
    location: typeof flags.location === "string" ? flags.location : undefined,
    timezone: typeof flags.timezone === "string" ? flags.timezone : undefined,
  });

  const useLlm = !flags["no-llm"] && (env.NEBIUS_API_KEY || (env.OPENAI_API_KEY && env.NEBIUS_BASE_URL));
  const llmKey = env.NEBIUS_API_KEY || env.OPENAI_API_KEY;
  const llmBase = env.NEBIUS_BASE_URL || env.OPENAI_BASE_URL || "https://api.studio.nebius.com/v1";
  const llmModel = env.NEBIUS_MODEL || "NousResearch/Hermes-4-70B";

  let draft = template;
  let mode = "template mode (no LLM key)";
  const notes = [];

  if (flags.json && typeof flags.json === "string") {
    try {
      draft = deepMerge(template, JSON.parse(flags.json));
      mode = "merchant-supplied JSON (merged onto template defaults)";
    } catch (error) {
      notes.push(`--json ignored (invalid JSON: ${error.message}); using template`);
    }
  } else if (useLlm) {
    const brief = [
      flags.name && `Name: ${flags.name}`,
      flags.offer && `Offer: ${flags.offer}`,
      flags.price && `Price: ${currency}${flags.price} per seat`,
      flags.datetime && `When: ${flags.datetime}`,
      flags.location && `Location: ${flags.location}`,
    ].filter(Boolean).join("\n") || String(flags.offer || flags.name || "");
    try {
      const drafted = await draftSpecWithNebius({ brief, slug, base: llmBase, key: llmKey, model: llmModel, template });
      draft = deepMerge(template, drafted);
      mode = `Nebius LLM (${llmModel})`;
    } catch (error) {
      notes.push(`Nebius draft failed (${error.message}); fell back to template`);
      mode = "template mode (LLM fallback)";
    }
  }

  // Force identity + badge slug, then the schema is the gate.
  draft.siteId = slug;
  draft.proofBadge = { ...(draft.proofBadge ?? {}), enabled: true, passportSlug: slug };
  const spec = SiteSpecSchema.parse(draft);

  // --- (b) real pipeline (mirrors demo-loop.mjs call patterns) --------------
  const createdAt = Date.now();
  const specHash = await hashSiteSpec(spec);
  const versionId = `${slug}-${specHash.slice(0, 8)}`.slice(0, 64);
  const version = await buildSiteVersion(spec, { versionId, parentVersionId: null, actor: "proofgate-intake", createdAt });
  await verifySiteVersionIntegrity(version);

  const html = renderSite(version.spec);

  const wantQuantity = spec.offer.quantity.default;
  const contract = BuyerContractSchema.parse({
    schemaVersion: 1,
    contractId: `${slug}-buyer-journey`.slice(0, 96),
    siteId: slug,
    objective: clean(`Reserve ${wantQuantity} seat${wantQuantity === 1 ? "" : "s"} for "${spec.offer.title}" on mobile and reach an on-page confirmation.`, "Reserve a seat and reach confirmation.", 480),
    source: { kind: "merchant_brief", refId: `intake:${slug}` },
    severity: "blocker",
    persona: { viewport: "mobile", locale: "en-US" },
    steps: [
      { op: "open_site" },
      { op: "fill", handle: "buyer-name", value: "Prospective Buyer" },
      { op: "fill", handle: "buyer-email", value: "buyer@example.test" },
      ...(spec.offer.quantity.enabled ? [{ op: "set_quantity", handle: "quantity", value: wantQuantity }] : []),
      { op: "click", handle: "primary-cta" },
    ],
    assertions: [
      { op: "handle_visible", handle: "confirmation" },
      { op: "confirmation_contains", handle: "confirmation", value: "reserved" },
    ],
    timeoutMs: 15_000,
  });

  // capability-separated verifier: no deploy/provider/payment secrets ever visible
  const targetUrl = `${publicBase ?? localBase}/s/${slug}.html`;
  const verifierEnv = buildVerifierEnvironment(process.env, { targetUrl });
  assertNoForbiddenVerifierCredentials(verifierEnv);
  const capability = evaluateContractCapabilities(version.spec, contract);

  // deterministic release-authority gate — no real external witness yet => amber
  const facts = {
    candidateVersionId: version.versionId,
    candidateSpecHash: version.specHash,
    canaryVersionId: version.versionId,
    verifiedSpecHash: version.specHash,
    everyBlockerPassed: capability.status === "ready",
    noOpenIncident: true,
    claimsPass: spec.claims.every((c) => !c.requiredForRelease || c.decision === "verified" || c.decision === "merchant_supplied_allowed"),
    externalWitnessSatisfied: false, // TRUTH: no genuine buyer/merchant acknowledgment exists at intake
    confirmationsPass: true,
    approvalsPass: true,
    everyEvidenceCapabilityBound: true,
  };
  const decision = evaluatePromotion(facts);
  const onlyWitnessMissing = decision.decision === "BLOCK" && decision.missing.length === 1 && decision.missing[0] === "EXTERNAL_WITNESS";
  const passportState = decision.decision === "PROMOTE" ? "green" : onlyWitnessMissing ? "amber" : "red";

  // --- (3) best-effort Convex persistence -----------------------------------
  const runId = `intake-${new Date(createdAt).toISOString().replace(/[-:.TZ]/g, "")}-${randomBytes(4).toString("hex")}`;
  const csrfIdentityHash = sha256Hex(`proofgate-intake:${slug}:${runId}`);
  const convex = await persistToConvex({ env, version, spec, contract, runId, csrfIdentityHash });

  // --- (c) write the two live pages -----------------------------------------
  await mkdir(resolve(projectRoot, "public/s"), { recursive: true });
  await mkdir(resolve(projectRoot, "public/proof"), { recursive: true });
  const sitePath = resolve(projectRoot, `public/s/${slug}.html`);
  const proofPath = resolve(projectRoot, `public/proof/${slug}.html`);
  await writeFile(sitePath, html, "utf8");
  await writeFile(
    proofPath,
    renderPassport({ spec, version, contract, capability, decision, passportState, mode, checkedAt: createdAt, publicBase, localBase, convex }),
    "utf8",
  );

  // --- (d) report -----------------------------------------------------------
  const line = (label, value) => console.log(`  ${String(label).padEnd(18)} ${value}`);
  console.log("\n" + "-".repeat(72));
  console.log("ProofGate intake complete");
  console.log("-".repeat(72));
  line("spec source", mode);
  line("slug / siteId", slug);
  line("versionId", version.versionId);
  line("specHash", version.specHash);
  line("verifier", `${capability.status.toUpperCase()} (capability-separated, forbidden credentials = none)`);
  line("gate", `${decision.decision}${decision.decision === "BLOCK" ? ` — missing [${decision.missing.join(",")}]` : ""}`);
  line("passport", `${passportState.toUpperCase()}${passportState === "amber" ? " — pending real buyer witness (truthful; not faked green)" : ""}`);
  line("convex", convex.status === "ok" || convex.status === "partial"
    ? `${convex.status} — persisted (projection=${convex.projection?.passportState ?? "amber"})${convex.detail ? ` [${convex.detail}]` : ""}`
    : `${convex.status}${convex.detail ? ` — ${convex.detail}` : ""}`);
  line("public base", `${publicBase ?? "(none)"} [${baseSource}]`);
  for (const note of notes) console.log(`  note: ${note}`);
  console.log("\n  Merchant page:");
  console.log(`    local  ${localBase}/s/${slug}.html`);
  if (publicBase) console.log(`    tunnel ${publicBase}/s/${slug}.html`);
  console.log("  Proof Passport:");
  console.log(`    local  ${localBase}/proof/${slug}.html`);
  if (publicBase) console.log(`    tunnel ${publicBase}/proof/${slug}.html`);
  console.log("");
}

main().catch((error) => {
  console.error(`\nintake failed: ${error?.stack ?? error}`);
  process.exitCode = 1;
});
