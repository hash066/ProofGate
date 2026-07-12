import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { JSDOM } from "jsdom";

import { createServer } from "../../src/server.js";

test("serves one transactional booking page", async (t) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const { port } = server.address();
  const response = await fetch(`http://127.0.0.1:${port}/`);
  const html = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^text\/html/);
  assert.match(html, /data-pg="primary-cta"/);
  assert.match(html, /data-pg="confirmation"/);
});

test("submitting the CTA renders the confirmation state", async () => {
  const html = await readFile(new URL("../../public/index.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "http://127.0.0.1:4173/" });
  globalThis.document = dom.window.document;
  globalThis.FormData = dom.window.FormData;

  await import(`../../public/app.js?test=${Date.now()}`);
  document.querySelector("[data-pg='buyer-name']").value = "Aisha";
  document.querySelector("[data-pg='quantity']").value = "2";
  document.querySelector("[data-pg='booking-form']").dispatchEvent(
    new dom.window.Event("submit", { bubbles: true, cancelable: true }),
  );

  const confirmation = document.querySelector("[data-pg='confirmation']");
  assert.equal(confirmation.hidden, false);
  assert.equal(confirmation.querySelector("h2").textContent, "You're on the list, Aisha.");
  assert.equal(confirmation.querySelector("p:not(.eyebrow)").textContent, "2 seats are reserved for the Saturday workshop demo.");

  dom.window.close();
  delete globalThis.document;
  delete globalThis.FormData;
});
