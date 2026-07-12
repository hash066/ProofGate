import type { SiteSpec } from "../../domain/src/site-spec";

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!);
}

function renderField(field: SiteSpec["offer"]["fields"][number]): string {
  const type = field.type === "select" ? "text" : field.type;
  return `<label for="${field.id}">${escapeHtml(field.label)}</label><input id="${field.id}" name="${field.id}" type="${type}" data-pg="${field.id}" ${field.required ? "required" : ""}>`;
}

function renderQuantity(spec: SiteSpec): string {
  const quantity = spec.offer.quantity;
  if (!quantity.enabled) return `<input type="hidden" name="quantity" data-pg="quantity" value="${quantity.default}">`;
  const options = Array.from({ length: quantity.max - quantity.min + 1 }, (_, index) => quantity.min + index)
    .map((value) => `<option value="${value}" ${value === quantity.default ? "selected" : ""}>${value} ${value === 1 ? "seat" : "seats"}</option>`)
    .join("");
  return `<label for="quantity">Seats</label><select id="quantity" name="quantity" data-pg="quantity">${options}</select>`;
}

export function renderSite(spec: SiteSpec): string {
  const radius = spec.theme.radius === "large" ? "26px" : spec.theme.radius === "medium" ? "16px" : "8px";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(spec.business.name)} — ${escapeHtml(spec.offer.title)}</title>
<style>:root{font-family:Inter,system-ui,sans-serif;color:#22251f;background:#f2efe7}*{box-sizing:border-box}body{margin:0;min-height:100vh;background:radial-gradient(circle at 10% 10%,#fff9dc,transparent 30%),#f2efe7}main{width:min(1080px,calc(100% - 32px));min-height:100vh;margin:auto;display:grid;grid-template-columns:1.15fr .85fr;gap:8vw;align-items:center;padding:64px 0}.eyebrow{color:${spec.theme.accent};font-size:.75rem;font-weight:800;letter-spacing:.14em;text-transform:uppercase}h1,h2{font-family:Georgia,serif;font-weight:400;line-height:1.03}h1{font-size:clamp(3rem,6vw,6rem);letter-spacing:-.045em;margin:.2em 0}.lede{color:#62645d;font-size:1.12rem;line-height:1.7}.card{border:1px solid #ded9cd;border-radius:${radius};background:#ffffffdc;box-shadow:0 28px 80px #372f231f;padding:clamp(28px,4vw,46px)}form{display:grid;gap:10px}label{font-size:.82rem;font-weight:700;margin-top:8px}input,select{border:1px solid #d6d2c9;border-radius:12px;padding:14px;font:inherit}button{margin-top:14px;border:0;border-radius:12px;background:#22251f;color:white;padding:16px;font-weight:800;cursor:pointer}button:hover{background:${spec.theme.accent}}.notice{font-size:.72rem;color:#777;text-align:center}.confirmation{text-align:center;padding:42px 0}.confirmation strong{display:grid;width:58px;height:58px;margin:auto;place-items:center;border-radius:50%;background:#e4efdc;color:#397032;font-size:1.7rem}.badge{display:inline-block;margin-top:30px;color:#666;font-size:.75rem}@media(max-width:800px){main{grid-template-columns:1fr;padding:42px 0}h1{font-size:clamp(3rem,14vw,5rem)}}</style></head>
<body><main><section><p class="eyebrow">${escapeHtml(spec.business.name)}</p><h1>${escapeHtml(spec.hero.headline)}</h1><p class="lede">${escapeHtml(spec.hero.subheadline)}</p><p>${escapeHtml(spec.offer.description)}</p></section>
<section class="card"><div data-pg="booking-panel"><p class="eyebrow">Workshop reservation</p><h2>${escapeHtml(spec.offer.title)}</h2><form data-pg="booking-form">${spec.offer.fields.map(renderField).join("")}${renderQuantity(spec)}<button type="submit" data-pg="primary-cta" ${spec.cta.enabled ? "" : "disabled"}>${escapeHtml(spec.cta.label)} →</button><p class="notice">Development confirmation only. No payment or external delivery is claimed.</p></form></div>
<section class="confirmation" data-pg="confirmation" hidden tabindex="-1" aria-live="polite"><strong>✓</strong><p class="eyebrow">Reservation confirmed</p><h2 data-pg="confirmation-heading">You are on the list.</h2><p data-pg="confirmation-message"></p></section>
${spec.proofBadge.enabled ? `<a class="badge" data-pg="proof-badge" href="/proof/${spec.proofBadge.passportSlug}">Verified by ProofGate · development spike</a>` : ""}</section></main>
<script>document.querySelector('[data-pg="booking-form"]').addEventListener('submit',function(event){event.preventDefault();var form=event.currentTarget;var data=new FormData(form);var name=String(data.get('buyer-name')||'guest').trim();var quantity=Number(data.get('quantity'));form.hidden=true;var confirmation=document.querySelector('[data-pg="confirmation"]');confirmation.querySelector('[data-pg="confirmation-heading"]').textContent='You are on the list, '+name+'.';confirmation.querySelector('[data-pg="confirmation-message"]').textContent=quantity+' '+(quantity===1?'seat is':'seats are')+' reserved for the Saturday workshop development demo.';confirmation.hidden=false;confirmation.focus()})</script></body></html>`;
}
