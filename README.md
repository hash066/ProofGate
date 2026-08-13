# Axcas — WhatsApp Business Agent

Axcas turns a small business owner’s WhatsApp voice note, prices, services, and photos into a verified business site with tracked WhatsApp enquiries—without requiring a laptop or dashboard. ProofGate remains the internal verification and release engine name.

The P0 flow is intentionally narrow:

1. Hermes `v0.18.2` receives English voice, photos, and text through WhatsApp Business Cloud.
2. Hermes submits typed intake and immutable assets through the `proofgate` command; it never writes Convex or release state directly.
3. A constrained renderer produces a mobile product or service site from `SiteSpecV2`. Agents never emit page code.
4. The verifier checks the candidate. An authenticated merchant button approves the exact candidate hash; deterministic policy alone may promote it.
5. Product CTAs append a privacy-safe click and redirect to a prefilled message on the merchant’s separate order number.
6. One exact, consented India/US lead batch may be approved for one-attempt Vapi qualification calls.
7. Three reel angles can be proposed; one approved plan is rendered from merchant photos with AWS Polly and FFmpeg and returned privately.
8. Hermes reports raw views/clicks and proposes—not publishes—a verified improvement.

No dashboard, payments, scraped leads, synthetic product imagery, automatic posting, or autonomous publishing is included.

## Run locally

```sh
npm ci
npm run typecheck
npm test
npm run dev:edge
```

Copy `.env.example` to an ignored `.env` and fill only the provider values you own. The Worker remains useful without provider credentials but truthfully reports blocked provider actions.

## Hermes command boundary

```sh
npm run proofgate -- intake brief.json
npm run proofgate -- candidate candidate.json
npm run proofgate -- verification candidate-scope.json
npm run proofgate -- release candidate-scope.json
npm run proofgate -- asset ASSET_ID MERCHANT_ID META_MESSAGE_ID image/jpeg photo.jpg
npm run proofgate -- lead lead.json
npm run proofgate -- batch batch.json
npm run proofgate -- reel reel.json
npm run proofgate -- deliver-reel REEL_ID ASSET_ID MERCHANT_WA_ID "Your approved reel" --submit
```

Commands validate locally by default. Add `--submit` only from the configured Hermes host. `verification` mints a short-lived single-use capability for the isolated verifier; `release` creates—not executes—a merchant approval request. Metrics and approved work are available through `metrics` and `guardian`; the only unauthenticated write is the exact capability-bound verifier evidence route.

## Important paths

| Path | Responsibility |
|---|---|
| `packages/domain/src/growth.ts` | Business, site, consent, approval, outcome, and reel schemas |
| `packages/renderer/src/render-bakery-site.ts` | Constrained, XSS-safe catalog renderer |
| `packages/release-policy/src/growth-policy.ts` | Immutable call-batch hash and approval predicate |
| `packages/whatsapp-io` | Meta signature parsing, buttons, and template adapter |
| `packages/calls` | Consent-first Vapi squad, outbound client, authenticated callback |
| `packages/reels` and `apps/reel-worker` | Polly voiceover and verified FFmpeg render |
| `apps/edge-runtime` | Public routes, webhooks, tracked redirects, private admin boundary |
| `convex/growth.ts` | Durable events, approvals, consent, guardian claims, structured outcomes |
| `hermes/skills/proofgate` | Hermes operating policy and typed commands |
| `infra/` | Credential-gated Cloudflare and AWS foundation |

## Public surface

- `GET /s/:slug` — published small-business site
- `GET /r/whatsapp/:siteId/:itemId` — tracked order redirect
- `GET /proof/:slug` — Proof Passport
- `GET /assets/:assetId` — explicitly selected immutable media
- `GET|POST /whatsapp/webhook` — Meta verification, approval interception, Hermes forwarding
- `POST /webhooks/vapi` — authenticated structured call outcome

All administrative mutation routes are bearer-authenticated and intended only for the Hermes command boundary.

## Deployment truth

See [Production launch](docs/PRODUCTION_LAUNCH.md) for the no-customer-API-key model,
server topology, launch sequence, and initial commercial packaging.

Convex development and production are deployed with separate service secrets. The hardened no-card File Storage fallback was verified through the public Worker with one synthetic PNG and an idempotent replay; release separation correctly kept it private. Worker HTTPS, foundation proof, and the WhatsApp GET challenge now respond successfully. This is foundation verification—not merchant acceptance, signed WhatsApp messaging, or Hermes deployment. R2 remains card-blocked and optional; the named Hermes origin and AWS foundation remain pending.

See [architecture](docs/architecture.md), [provider readiness](docs/provider-readiness.md), [privacy and consent](docs/privacy-and-consent.md), and [evidence](EVIDENCE.md).
The six-step live run and exact evidence requirements are in [live acceptance](docs/LIVE_ACCEPTANCE.md).
