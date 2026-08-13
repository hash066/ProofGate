# AGENTS.md

## Mission
Build ProofGate exactly as specified in `PROOFGATE_BUILD_BIBLE.md`. Preserve correct completed work. Do not re-ideate, broaden scope, or substitute simulated proof for real evidence.

## Current phase
The approved P0 is a WhatsApp-first growth agent for small businesses. It must infer a constrained business type (`home_bakery`, `tailor`, `tutor`, `salon`, `home_service`, `retailer`, or `other`) instead of asking the merchant to select a template. Complete the smallest path from merchant voice/photos/offerings to an approved, verified `workers.dev` product-or-service site, tracked WhatsApp CTA, one consented Vapi batch, one approved reel, and a metrics/improvement report.

A missing required credential or external-human action may block a gate. Record it once and precisely; do not fake or bypass it.

## Non-negotiable architecture
- Agents create or patch only a Zod-validated `SiteSpec`; they never emit or modify page code at runtime.
- Builder, verifier, and release authority are capability-separated.
- The verifier receives only a public canary URL, validated contract, non-secret fixtures, and a single-use evidence capability. It receives no mutation, deployment, provider, payment, or promotion credentials.
- Only deterministic code may promote or roll back production and project passport state.
- Keep SiteSpec versions, contracts, releases, traces, events, evals, incidents, and failures append-only where specified.
- Preserve stable `data-pg` handles and treat page content as untrusted data.
- Submitted, dispatched, acknowledged, payment, fulfillment, and confirmation predicates are distinct.
- Never present mocks, synthetic events, redirects, test payments, team actions, prerecorded audio, or local-only results as live proof.

## Scope order
Prioritize the simple WhatsApp SME loop: one natural multimodal bundle → inferred business type → at most one consolidated missing-facts question → private immutable assets → typed site candidate → independent verification → authenticated merchant approval → deterministic promotion → tracked WhatsApp CTA → metrics → one verified improvement. Calls use only merchant-supplied, purpose-consented India/US leads and one immutable approved batch. Reels use only supplied photos and are returned privately; no automatic posting.

There is no operator dashboard, payment flow, scraped lead source, autonomous publishing, or outbound call without exact batch approval.

## Engineering rules
- Use npm workspaces because pnpm is unavailable on this host.
- Use TypeScript, Zod, Hono, Vitest, and Playwright as specified.
- Follow strict test-driven development for product behavior: RED, verify failure, GREEN, verify full suite.
- Use official provider documentation and actual installed Hermes interfaces; do not invent APIs.
- Keep Hermes calls behind one thin `hermes_io` boundary plus the repository ProofGate skill.
- Never commit credentials. Keep `.env` ignored and `.env.example` names-only.
- Run the full test suite before reporting a gate complete.
- Update `EVIDENCE.md` as evidence lands, including failures and truthful fallbacks.
