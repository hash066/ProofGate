import { SiteSpecV2Schema, type BusinessType, type SiteSpecV2 } from "../../domain/src/growth";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]!);
}

function formatPrice(priceMinor: number | undefined, currency: "INR" | "USD"): string {
  if (priceMinor === undefined) return "Contact for price";
  return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(priceMinor / 100);
}

const catalogLabels: Record<BusinessType, string> = {
  home_bakery: "Menu",
  tailor: "Services & styles",
  tutor: "Services",
  salon: "Services",
  home_service: "Services",
  retailer: "Products",
  other: "What we offer",
};

export function renderBusinessSite(input: SiteSpecV2, version: { versionId: string; specHash: string }, options: { assetBasePath?: string; preview?: boolean } = {}): string {
  const spec = SiteSpecV2Schema.parse(input);
  const businessType = spec.businessType ?? "other";
  const assetPath = (assetId: string) => `${options.assetBasePath ?? "/assets"}/${encodeURIComponent(assetId)}`;
  const ctaHref = (itemId: string) => options.preview ? "#preview-only" : `/r/whatsapp/${spec.siteId}/${itemId}`;
  const cards = spec.catalog.map((item) => `<article class="product" data-pg="product-${item.id}">
<img src="${assetPath(item.imageAssetId)}" alt="${escapeHtml(item.name)}" loading="lazy">
<div class="product-copy"><p class="price">${escapeHtml(formatPrice(item.priceMinor, item.currency))}</p><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.description)}</p>
${item.available ? `<a data-pg="item-cta-${item.id}" class="button" href="${ctaHref(item.id)}"${options.preview ? ' aria-disabled="true"' : ""}>${escapeHtml(spec.whatsappCta.label)}</a>` : `<span data-pg="item-unavailable-${item.id}" aria-label="Currently unavailable">Currently unavailable</span>`}</div></article>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(spec.seo.title)}</title><meta name="description" content="${escapeHtml(spec.seo.description)}"><style>:root{--accent:${spec.theme.accent};--bg:${spec.theme.background};font-family:Inter,system-ui,sans-serif;color:#271c18;background:var(--bg)}*{box-sizing:border-box}body{margin:0}main{width:min(1120px,calc(100% - 32px));margin:auto}.preview-banner{padding:10px 16px;text-align:center;background:#fff4cf;color:#493b13;font-weight:750}.hero{display:grid;grid-template-columns:1fr 1fr;gap:6vw;align-items:center;min-height:72vh;padding:64px 0}.hero img,.product img{width:100%;object-fit:cover;border-radius:24px}.hero img{aspect-ratio:4/5}.eyebrow,.price{color:var(--accent);font-weight:800;text-transform:uppercase;letter-spacing:.1em;font-size:.78rem}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.05}h1{font-size:clamp(3.2rem,8vw,7rem);margin:.15em 0}.lede{font-size:1.1rem;line-height:1.7;color:#685951}.catalog{display:grid;grid-template-columns:repeat(3,1fr);gap:24px;padding:32px 0 80px}.product{background:white;border:1px solid #eaded2;border-radius:24px;overflow:hidden}.product img{aspect-ratio:4/3;border-radius:0}.product-copy{padding:24px}.button{display:inline-block;background:#211814;color:white;text-decoration:none;border-radius:999px;padding:14px 20px;font-weight:800}.details{padding:40px 0 100px;border-top:1px solid #decfc2}.proof{color:#6b615c}.sticky{display:none}@media(max-width:760px){.hero{grid-template-columns:1fr;padding:36px 0}.catalog{grid-template-columns:1fr}.sticky{display:block;position:fixed;z-index:5;left:16px;right:16px;bottom:14px;text-align:center}.details{padding-bottom:130px}}</style></head><body data-pg-version="${escapeHtml(version.versionId)}" data-pg-hash="${escapeHtml(version.specHash)}">${options.preview ? '<div class="preview-banner" data-pg="preview-banner">Private preview · ordering buttons activate after approval</div>' : ""}<main><section class="hero"><div><p class="eyebrow">${escapeHtml(spec.business.name)}</p><h1>${escapeHtml(spec.hero.headline)}</h1><p class="lede">${escapeHtml(spec.hero.subheadline)}</p><p>${escapeHtml(spec.fulfillment.area)} · ${escapeHtml(spec.fulfillment.leadTime)}</p></div><img src="${assetPath(spec.hero.imageAssetId)}" alt="${escapeHtml(spec.business.name)} featured offering"></section><section><p class="eyebrow">${escapeHtml(catalogLabels[businessType])}</p><div class="catalog" data-pg="catalog">${cards}</div></section><section class="details"><h2>Details</h2><p>${escapeHtml(spec.policies.ordering)}</p>${spec.policies.allergens ? `<p>${escapeHtml(spec.policies.allergens)}</p>` : ""}${spec.proofBadge.enabled && !options.preview ? `<a class="proof" data-pg="proof-badge" href="/proof/${spec.proofBadge.passportSlug}">View Proof Passport</a>` : ""}</section></main>${spec.whatsappCta.stickyOnMobile ? `<a class="button sticky" data-pg="primary-cta" href="${ctaHref("general")}"${options.preview ? ' aria-disabled="true"' : ""}>${escapeHtml(spec.whatsappCta.label)}</a>` : ""}</body></html>`;
}

export const renderBakerySite = renderBusinessSite;
