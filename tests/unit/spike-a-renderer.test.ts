import { describe, expect, it } from "vitest";

import { initialSpikeSiteSpec, SiteSpecSchema } from "../../packages/domain/src/site-spec";
import { renderSite } from "../../packages/renderer/src/render-site";

describe("Spike A public renderer", () => {
  it("renders a Zod-validated SiteSpec with every stable transactional handle", () => {
    const spec = SiteSpecSchema.parse(initialSpikeSiteSpec);
    const html = renderSite(spec);

    expect(html).toContain('data-pg="quantity"');
    expect(html).toContain('data-pg="buyer-name"');
    expect(html).toContain('data-pg="buyer-email"');
    expect(html).toContain('data-pg="primary-cta"');
    expect(html).toContain('data-pg="confirmation"');
  });

  it("rejects an invalid accent instead of rendering agent-controlled page code", () => {
    expect(() =>
      SiteSpecSchema.parse({
        ...initialSpikeSiteSpec,
        theme: { ...initialSpikeSiteSpec.theme, accent: "red; background:url(javascript:alert(1))" },
      }),
    ).toThrow();
  });
});
