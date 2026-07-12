# EVIDENCE.md — the ledger mentors read

Format per PROOFGATE_BUILD_BIBLE.md §26: one row per claim. **Live surfaces and live data are primary; screenshots are backups.** Fill DURING the build (§0 rule 8) — an empty cell at judging means the claim does not exist. List any §7/§22 truthful fallback in force at the bottom.

## Claims

| Claim | Live proof | Backup | Status | Owner |
|---|---|---|---|---|
| Hermes eligibility (coding partner) | Session `20260712_130611_5d7887`; capability audit and three restricted architecture workstreams delegated | Screenshots | ◐ development evidence recorded | Launch Manager |
| Hermes eligibility (base harness) | `docs/hermes-capabilities.md`; delegated task receipt `deleg_e46334f4` | Session receipt | ◐ gateway/cron product proof pending | Launch Manager |
| Three real outputs | URLs and Convex run query | Screenshots | ☐ | |
| 85 percent success | Run denominator query | Export | ☐ | |
| Request-specific plans + revision | Two trace trees, different plans, one bounce-back | JSON export | ☐ | |
| Runtime role (org L5) | Role row and trace event showing role absent at kickoff | JSON export | ☐ | |
| Trace tree (cost, filters) | Control-room URL | Screenshot | ☐ | |
| Diff and search | Control-room URL | Recording | ☐ | |
| Actual alert fired | Telegram alert and alert row | Screenshot | ☐ | |
| Auto-created eval | Eval row linked to failure | Export | ☐ | |
| Memory used across handoffs | Trace memory bundle (now + user history + policy) | Screenshot | ☐ | |
| Cost and latency | Run totals (≤5 min, ≤$0.50 target) | Provider dashboards | ☐ | |
| Non-engineer UI | Live operator demonstration after one walkthrough | Short recording | ☐ | |
| Wispr (500+ words during event) | Stats screenshot | None | ☐ | |
| ElevenLabs (fresh TTS changes contract state; Whisper intake does NOT count) | Request ID and fresh audio | Provider dashboard | ☐ | |
| Voice Witness chain | Consent, private audio ID, provider processing ID, transcript, split, contract candidate, trace | Redacted export | ☐ | |
| Convex | Live tables updating | Schema in repo | ☐ | |
| Linkup (claim gate acts on result) | Adapter/code path, live query, stored citation, resulting decision | Screenshot | ☐ | |
| Cloudflare | Development Spike A: `https://proofgate-spike-a.bygone-piper.workers.dev/s/saturday-sessions`; version `fe7a8cd1-a765-4aab-aa08-058297632b2c`; spec hash `3505c5e50162d788e2a78eabe7afc6dd473a5e20e2c1fccd56ab699c7a05c42b` | `evidence/spike-a/report.json`, screenshots, deployment output | ◐ real temporary surface; not final evidence | Launch Manager |
| Dodo (live mode; power-up status disputed — ask organizer) | Live payment and signed webhook | Dashboard | ☐ | |
| Native impressions | Platform analytics on builder device | Screenshot | ☐ | |
| Reactions and comments | Live public post and organic identities | Screenshot | ☐ | |
| Visitors | Read-only analytics for mentors | Export | ☐ | |
| Signups (activated: identity + first-use event, waitlist ≠ signup) | Activated-user query | Export | ☐ | |
| Revenue (₹199 Guardian, live mode, outside friend circle, auto-provisioned) | Completed live-mode payment tied to usage | Dashboard | ☐ | |
| Cold-user L4 quality test | Unassisted first value + blank/back/invalid-input tests + manual-alternative comparison | Recording | ☐ | |

## Development gate evidence

- Mandatory development Spike B passed on run `spike-b-20260712095158729-e1282552` with a consenting external merchant. Convex independently verified the signed submission, Hermes recorded recipient-bound Telegram provider message ID `20`, the external merchant consumed the single-use capability, and the deterministic projection returned `green / EXACT_EXTERNAL_ACKNOWLEDGMENT` with submitted, dispatched, and acknowledged predicates all true. Evidence: `evidence/spike-b/spike-b-20260712095158729-e1282552.json` and `evidence/spike-b/spike-b-20260712095158729-e1282552-completion.json`. This passes the mandatory development gate but does **not** count as final production or judging evidence.
- Earlier development Spike B runs `spike-b-20260712084907167-13815d3f` and `spike-b-20260712085751067-cefc221a` remain preserved. Run `...cefc221a` received a genuine external acknowledgment, but its pre-hardening dispatch identity format did not satisfy the recipient-bound oracle and is not counted as the passing gate run.
- Failed Spike B attempts `spike-b-20260712084657685-ee6a54d9` and `spike-b-20260712084701490-833d51fe` are preserved with the real `spawn EINVAL` failure. The dispatcher now invokes the Convex JavaScript entrypoint through the active Node runtime instead of spawning `npx.cmd`.
- Oracle hardening rejects mismatched nonce correlation, recipient identity, event windows, unauthenticated dispatch, and replayed booking sessions. These are code/test facts only, not external proof.
- Hardened Convex functions were deployed to the existing development deployment at 14:32 IST. Temporary Worker version `f600bce2-6a27-4691-a3cb-9fb6d3d8462a` was deployed at `https://proofgate-spike-a.roasted-joke.workers.dev`; `/health`, `/s/saturday-sessions`, missing-token `/ack`, and gray `/proof/saturday-sessions` were checked live. This remains temporary development infrastructure, not final evidence.
- At 14:41 IST, the development Convex deployment was updated so subject/session issuance no longer writes a `submitted` event. `oracle:submitBooking` must independently verify the signed request, nonce, time window, stored session binding, and replay state before appending `submitted`. Local verification is 3 legacy tests plus 17 Vitest tests with clean TypeScript. No fresh external run was created, so this is hardened development code only.
- A bearer-link click later appended an `acknowledged` row for run `spike-b-20260712085751067-cefc221a`. It has no Telegram provider update ID and does not independently authenticate the clicker, so it is preserved as development evidence only. After redeploying the current policy at 15:21 IST, the live projection correctly returned `submitted=true`, `dispatched=false`, `acknowledged=true`, passport `amber`, reason `EXTERNAL_ACKNOWLEDGMENT_PENDING`; the old dispatch identity does not match the canonical bound recipient.
- Full verification at 15:17 IST passed 3 legacy tests and 18 Vitest tests with clean TypeScript. Live smoke checks returned HTTP 200 for `/health`, `/s/saturday-sessions`, and `/proof/saturday-sessions`; missing-token `/ack` correctly returned HTTP 400. The proof route remains truthfully gray.

## Session receipts log

| Timestamp | Session id | What was built | Notes |
|---|---|---|---|
| 2026-07-12 13:11 IST | `20260712_130611_5d7887` | Full Bible read; readiness and Hermes capability audit; Spike A public Worker + capability-scrubbed verifier | Spike A had one preserved HTTP 500, then three consecutive passes in fresh contexts. |

## Truthful fallbacks in force

- Cloudflare account authentication is absent. Spike A uses a real **temporary** Workers URL and is explicitly development-only; it is not final production evidence.
- Convex development configuration and append-only persistence are present. Mandatory development Spike B is green for run `spike-b-20260712095158729-e1282552`; this does not establish production readiness or final evidence.
- The original `bygone-piper` temporary Worker URL no longer resolves. The current `roasted-joke` Worker is reachable but temporary and must be reverified before any future consented dispatch.
- ElevenLabs and Linkup credentials are absent. No provider claim is made.
- Dodo live mode is unavailable; booking acknowledgment remains the core external-oracle path.
- The passing development Spike B binds the consent-receipt reference, canonical Telegram recipient hash, provider message ID, signed session, exact quantity, immutable version/spec hash, and external merchant acknowledgment. Team/local actions still cannot satisfy the real-witness predicate.
- Preserved Spike A failure: `evidence/spike-a/failures.ndjson` records an actual transient HTTP 500 on attempt 2 before the successful three-run sequence.
- Public live URL (temporary): `https://rides-min-logos-finger.trycloudflare.com` serves the Saturday Sessions booking page (HTTP 200, all `data-pg` handles present). This is **NOT** a real Cloudflare Workers deploy — Cloudflare account auth is still absent and `.env` is blank. It is a **temporary cloudflared quick tunnel to the local `node src/server.js` on `127.0.0.1:4173`**, established 2026-07-12 10:17Z (UTC). The URL dies when the local server or the `cloudflared` process stops, and trycloudflare quick-tunnel hostnames are ephemeral; reverify before relying on it.
