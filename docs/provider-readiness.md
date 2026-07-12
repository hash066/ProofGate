# Pre-event provider readiness

Audit completed: **2026-07-12 13:11 IST**, before feature work.  
This document records readiness truthfully; **BLOCKED** means the administrative prerequisite is not complete and no provider proof may be claimed.

| Area | Checklist result | Status | Required unblock |
|---|---|---|---|
| Hermes | Gateway polling and inbound routing verified; authorized external participant received recipient-bound outbound messages; provider receipts `19` and `20` preserved | READY FOR DEVELOPMENT SPIKE | Production/final evidence still requires the durable target environment and final-run receipts. |
| Cloudflare | `npx wrangler@latest` available; account authentication absent; temporary deploy available | PARTIAL | Authenticate with `wrangler login` or provide a scoped Worker API token for durable production. A temporary development URL cannot be final evidence. |
| Convex | Development project `ProofGate` and deployment `vivid-warthog-67` configured; schema/functions deployed; append-only submitted, dispatched, and acknowledged events verified | READY FOR DEVELOPMENT SPIKE | Production deployment and final access policy remain outstanding. |
| ElevenLabs | Hermes and project report no ElevenLabs credential or selected voice | BLOCKED | Activate perk/account, provide API key and voice ID, then generate one private live health-check clip. |
| Linkup | No API key present; live query not possible | BLOCKED | Activate credits from the current authoritative event flow and provide `LINKUP_API_KEY`. |
| Wispr Flow | No inspectable account/statistics artifact is available from this repository/session | BLOCKED | Join through current event link, confirm statistics page, and begin event-day dictation; do not pre-count words. |
| Dodo | No API key, webhook secret, product ID, environment, or business ID present | BLOCKED / OPTIONAL FOR CORE | Complete live activation/KYC, create distinct Guardian product, configure dedicated live webhook, and prove live checkout + verified retrieval. Continue core with booking oracle. |
| Analytics | No provider/site ID present | BLOCKED | Create project, define team/test exclusion, and prepare read-only judge access. |
| Participants | One consenting external merchant completed mandatory development Spike B; consent reference and hashed binding are preserved | PARTIAL | Recruit the remaining participants/backups required for three final external runs and obtain separate voice/recording consent. |

## Precisely missing project configuration

Durable Cloudflare credentials/worker configuration, `TELEGRAM_HOME_CHANNEL`, `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `LINKUP_API_KEY`, `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, `DODO_PRODUCT_ID`, `DODO_ENVIRONMENT`, `ANALYTICS_PROVIDER`, and `ANALYTICS_SITE_ID` are not present in the build process environment. Convex development configuration is now present; secret values remain local and are not recorded here.

Hermes has a separately configured Telegram adapter; project-level `TELEGRAM_BOT_TOKEN` absence is therefore not treated as unavailability. Real inbound routing, outbound provider receipts, and an external acknowledgment were observed through that adapter.

## Gate decision

- Spike A may proceed using a clearly labeled Cloudflare temporary deployment and cannot count as final judging evidence.
- Mandatory development Spike B passed on `spike-b-20260712095158729-e1282552`: signed submission, recipient-bound Telegram dispatch, and exact external-merchant acknowledgment all projected true in Convex. This is development gate evidence only, not final production/judging evidence.
- The Bible kill gate is cleared for the smallest complete P0 loop. No local or synthetic acknowledgment was substituted.
