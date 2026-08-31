import { describe, expect, it, vi } from "vitest";
// jsdom 29 does not ship declarations; keep the runtime isolated to this browser-behaviour test.
// @ts-expect-error -- the concrete window is narrowed immediately below.
import { JSDOM } from "jsdom";
import { renderStudio, renderStudioCss } from "../../packages/renderer/src/render-studio";
import { renderStudioClientJs } from "../../packages/renderer/src/render-studio-client";

describe("Axcas Studio visual editor", () => {
  it("previews untrusted content as text, reorders offerings, supports undo, and switches devices", () => {
    const dom = new JSDOM(renderStudio("919999888877"), {
      runScripts: "outside-only",
      url: "https://axcas.test/studio",
    });
    const window = (dom as { window: Window & typeof globalThis }).window;
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", { value: vi.fn() });
    Object.defineProperty(window.URL, "createObjectURL", { value: vi.fn(() => "blob:https://axcas.test/preview") });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: vi.fn() });
    Object.defineProperty(window, "fetch", { value: vi.fn(async () => ({ ok: false, status: 401 })) });

    window.eval(renderStudioClientJs());
    const business = window.document.querySelector<HTMLInputElement>('input[name="businessName"]')!;
    business.focus();
    business.value = '<img src=x onerror="alert(1)">';
    business.dispatchEvent(new window.Event("input", { bubbles: true }));
    const canvasName = window.document.querySelector("#canvasBusiness")!;
    expect(canvasName.textContent).toBe('<img src=x onerror="alert(1)">');
    expect(canvasName.querySelector("img")).toBeNull();

    const undo = window.document.querySelector<HTMLButtonElement>('[data-pg="undo"]')!;
    expect(undo.disabled).toBe(false);
    undo.click();
    expect(business.value).toBe("");

    window.document.querySelector<HTMLButtonElement>("#addOfferingButton")!.click();
    const cards = Array.from(window.document.querySelectorAll("[data-offering]")) as HTMLElement[];
    expect(cards).toHaveLength(2);
    cards[0].querySelector<HTMLInputElement>('[data-field="name"]')!.value = "First";
    cards[1].querySelector<HTMLInputElement>('[data-field="name"]')!.value = "Second";
    cards[0].querySelector<HTMLButtonElement>('[data-move="down"]')!.click();
    expect(window.document.querySelector<HTMLElement>('[data-offering] [data-field="name"]')!.getAttribute("value") ?? (window.document.querySelector<HTMLInputElement>('[data-offering] [data-field="name"]')!).value).toBe("Second");

    window.document.querySelector<HTMLButtonElement>('[data-device="mobile"]')!.click();
    expect(window.document.querySelector("#studioCanvas")!.classList.contains("device-mobile")).toBe(true);
  });

  it("keeps the visual editor structured rather than exposing page code", () => {
    const html = renderStudio();
    const css = renderStudioCss();
    expect(html).toContain('data-pg="section-navigator"');
    expect(html).toContain('data-pg="studio-canvas"');
    expect(html).not.toContain("contenteditable");
    expect(html).not.toContain("HTML editor");
    expect(css).toContain(".builder-shell");
  });

  it("starts a separate guided project without exposing a template or code choice", () => {
    const dom = new JSDOM(renderStudio(), { runScripts: "outside-only", url: "https://axcas.test/studio" });
    const window = (dom as { window: Window & typeof globalThis }).window;
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", { value: vi.fn() });
    Object.defineProperty(window.URL, "createObjectURL", { value: vi.fn(() => "blob:https://axcas.test/preview") });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: vi.fn() });
    Object.defineProperty(window, "fetch", { value: vi.fn(async () => ({ ok: false, status: 401 })) });
    window.eval(renderStudioClientJs());

    window.document.querySelector<HTMLButtonElement>("#newProjectButton")!.click();
    expect(window.document.querySelector("#newProjectPanel")!.classList.contains("hidden")).toBe(false);
    window.document.querySelector<HTMLButtonElement>('[data-new-intent="reels"]')!.click();

    expect(window.document.querySelector<HTMLInputElement>('input[name="intent"][value="reels"]')!.checked).toBe(true);
    expect(window.document.querySelector<HTMLFormElement>("#projectForm")!.dataset.projectId).toBe("");
    expect(window.document.querySelector("#versionCue")!.textContent).toBe("New draft");
    expect(renderStudio()).not.toContain("API key");
  });

  it("shows linked browsers in plain language without exposing the session credential", async () => {
    const dom = new JSDOM(renderStudio(), { runScripts: "outside-only", url: "https://axcas.test/studio" });
    const window = (dom as { window: Window & typeof globalThis }).window;
    Object.defineProperty(window.HTMLElement.prototype, "scrollIntoView", { value: vi.fn() });
    Object.defineProperty(window.URL, "createObjectURL", { value: vi.fn(() => "blob:https://axcas.test/preview") });
    Object.defineProperty(window.URL, "revokeObjectURL", { value: vi.fn() });
    const fetch = vi.fn(async (input: string | URL | Request) => {
      if (String(input) === "/api/studio/sessions") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ sessions: [{ deviceId: "device-private-1", current: true, createdAt: 1_780_000_000_000, expiresAt: 1_782_592_000_000 }] }),
        };
      }
      return { ok: false, status: 401, json: async () => ({}) };
    });
    Object.defineProperty(window, "fetch", { value: fetch });
    window.eval(renderStudioClientJs());

    window.document.querySelector<HTMLButtonElement>("#manageAccessButton")!.click();
    await vi.waitFor(() => expect(window.document.querySelector("#sessionList")!.textContent).toContain("This browser"));
    expect(window.document.querySelector("#sessionList")!.textContent).not.toContain("device-private-1");
    expect(fetch).toHaveBeenCalledWith("/api/studio/sessions", { cache: "no-store" });
  });
});
