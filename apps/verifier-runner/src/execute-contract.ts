import type { Page } from "@playwright/test";

import {
  BuyerContractSchema,
  ContractObservationSchema,
  type BuyerContract,
  type ContractObservation,
} from "../../../packages/contract-runner/src/contract";

type ExecuteContractInput = {
  targetUrl: string;
  expectedVersionId: string;
  expectedSpecHash: string;
  contract: BuyerContract;
};

function validateTargetUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("verifier requires a public HTTPS canary");
  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
  ) {
    throw new Error("verifier refuses private network targets");
  }
  return url;
}

function passed(
  itemId: string,
  kind: ContractObservation["kind"],
  operation: string,
  observedSummary: string,
): ContractObservation {
  return ContractObservationSchema.parse({
    itemId,
    kind,
    operation,
    status: "passed",
    observedSummary,
    observedAt: Date.now(),
  });
}

function failed(
  itemId: string,
  kind: ContractObservation["kind"],
  operation: string,
  failureCode: NonNullable<ContractObservation["failureCode"]>,
  observedSummary: string,
): ContractObservation {
  return ContractObservationSchema.parse({
    itemId,
    kind,
    operation,
    status: "failed",
    failureCode,
    observedSummary,
    observedAt: Date.now(),
  });
}

export async function executeContractInPage(
  page: Page,
  input: ExecuteContractInput,
): Promise<ContractObservation[]> {
  const target = validateTargetUrl(input.targetUrl);
  const contract = BuyerContractSchema.parse(input.contract);
  if (contract.siteId !== target.pathname.split("/").filter(Boolean).at(-1) && !target.pathname.includes(input.expectedVersionId)) {
    throw new Error("contract target is not bound to the requested site or version");
  }
  page.setDefaultTimeout(contract.timeoutMs);
  const observations: ContractObservation[] = [];

  for (const [index, step] of contract.steps.entries()) {
    const itemId = `step-${index}`;
    try {
      if (step.op === "open_site") {
        const response = await page.goto(target.toString(), { waitUntil: "networkidle" });
        if (!response || !response.ok()) {
          observations.push(failed(itemId, "step", step.op, "NAVIGATION_FAILED", "Public canary did not return a successful response."));
          return observations;
        }
        const headers = response.headers();
        if (headers["x-proofgate-spec-hash"] !== input.expectedSpecHash) {
          throw new Error("manifest hash mismatch");
        }
        if (headers["x-proofgate-version-id"] !== input.expectedVersionId) {
          throw new Error("manifest version mismatch");
        }
        observations.push(passed(itemId, "step", step.op, "Pinned immutable canary opened successfully."));
        continue;
      }

      const locator = page.locator(`[data-pg="${step.handle}"]`);
      if ((await locator.count()) !== 1) {
        observations.push(failed(itemId, "step", step.op, "HANDLE_MISSING", `Required stable handle ${step.handle} was not unique.`));
        return observations;
      }

      if (step.op === "fill") {
        await locator.fill(step.value);
        observations.push(passed(itemId, "step", step.op, `Filled stable handle ${step.handle}.`));
        continue;
      }

      if (step.op === "set_quantity") {
        const control = await locator.evaluate((element) => {
          const select = element instanceof HTMLSelectElement ? element : null;
          const input = element instanceof HTMLInputElement ? element : null;
          return {
            tagName: element.tagName,
            hidden: input?.type === "hidden" || (element as HTMLElement).hidden,
            disabled: Boolean((select ?? input)?.disabled),
            values: select ? Array.from(select.options, (option) => option.value) : [],
          };
        });
        if (control.tagName !== "SELECT" || control.hidden || control.disabled || !control.values.includes(String(step.value))) {
          observations.push(
            failed(
              itemId,
              "step",
              step.op,
              "QUANTITY_UNSUPPORTED",
              `The pinned canary cannot select the required quantity ${step.value}.`,
            ),
          );
          return observations;
        }
        await locator.selectOption(String(step.value));
        observations.push(passed(itemId, "step", step.op, `Selected exact quantity ${step.value}.`));
        continue;
      }

      await locator.click();
      observations.push(passed(itemId, "step", step.op, `Clicked stable handle ${step.handle}.`));
    } catch (error) {
      if (error instanceof Error && /manifest (hash|version) mismatch/.test(error.message)) throw error;
      observations.push(
        failed(
          itemId,
          "step",
          step.op,
          step.op === "set_quantity" ? "QUANTITY_UNSUPPORTED" : "ASSERTION_FAILED",
          `Deterministic ${step.op} operation failed.`,
        ),
      );
      return observations;
    }
  }

  for (const [index, assertion] of contract.assertions.entries()) {
    const itemId = `assertion-${index}`;
    const locator = page.locator(`[data-pg="${assertion.handle}"]`);
    try {
      if ((await locator.count()) !== 1) {
        observations.push(failed(itemId, "assertion", assertion.op, "HANDLE_MISSING", `Required stable handle ${assertion.handle} was not unique.`));
        return observations;
      }
      let matches = false;
      if (assertion.op === "handle_visible") matches = await locator.isVisible();
      else if (assertion.op === "handle_enabled") matches = await locator.isEnabled();
      else matches = (await locator.textContent())?.includes(assertion.value) ?? false;

      if (!matches) {
        observations.push(failed(itemId, "assertion", assertion.op, "ASSERTION_FAILED", `Assertion ${assertion.op} did not match.`));
        return observations;
      }
      observations.push(passed(itemId, "assertion", assertion.op, `Assertion ${assertion.op} matched.`));
    } catch {
      observations.push(failed(itemId, "assertion", assertion.op, "ASSERTION_FAILED", `Assertion ${assertion.op} could not be evaluated.`));
      return observations;
    }
  }

  return observations;
}
