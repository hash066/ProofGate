import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

import { assertNoForbiddenVerifierCredentials } from "./capabilities";

const targetUrl = process.env.PROOFGATE_TARGET_URL ?? process.argv[2];
if (!targetUrl) throw new Error("Usage: npm run verify:spike-a -- <public Cloudflare URL>");
if (!/^https:\/\//.test(targetUrl)) throw new Error("Spike A requires a public HTTPS URL");
assertNoForbiddenVerifierCredentials(process.env);

const evidenceDirectory = new URL("../../../evidence/spike-a/", import.meta.url);
await mkdir(evidenceDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results: Array<Record<string, unknown>> = [];

try {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
    const page = await context.newPage();
    const startedAt = new Date().toISOString();
    const response = await page.goto(targetUrl, { waitUntil: "networkidle" });
    if (!response || !response.ok()) throw new Error(`Attempt ${attempt}: public page returned ${response?.status() ?? "no response"}`);
    const specHash = response.headers()["x-proofgate-spec-hash"];
    if (!/^[a-f0-9]{64}$/.test(specHash ?? "")) throw new Error(`Attempt ${attempt}: missing immutable spec hash`);

    await page.locator('[data-pg="buyer-name"]').fill(`External replay ${attempt}`);
    await page.locator('[data-pg="buyer-email"]').fill(`replay-${attempt}@example.test`);
    await page.locator('[data-pg="quantity"]').selectOption("2");
    await page.locator('[data-pg="primary-cta"]').click();
    const confirmation = page.locator('[data-pg="confirmation"]');
    await confirmation.waitFor({ state: "visible" });
    const confirmationText = await confirmation.textContent();
    if (!confirmationText?.includes("2 seats are reserved")) throw new Error(`Attempt ${attempt}: wrong confirmation state`);

    const screenshot = new URL(`attempt-${attempt}.png`, evidenceDirectory);
    await page.screenshot({ path: fileURLToPath(screenshot), fullPage: true });
    results.push({
      attempt,
      browserContext: `fresh-${attempt}`,
      startedAt,
      finishedAt: new Date().toISOString(),
      targetUrl,
      status: "passed",
      httpStatus: response.status(),
      specHash,
      screenshot: fileURLToPath(screenshot),
      credentialCapabilities: "public-url-only; no mutation/deploy/provider/payment/promotion credentials",
    });
    await context.close();
  }
} finally {
  await browser.close();
}

const report = { kind: "development-spike-a", countsAsFinalEvidence: false, runs: results };
await writeFile(new URL("report.json", evidenceDirectory), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
