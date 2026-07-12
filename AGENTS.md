# AGENTS.md

## Mission
Build ProofGate exactly as specified in `PROOFGATE_BUILD_BIBLE.md`. Preserve correct completed work. Do not re-ideate, broaden scope, or substitute simulated proof for real evidence.

## Current phase
The full build is authorized. Follow the Build Bible gates in order:
1. Provider-readiness audit and Hermes capability matrix.
2. Spike A on a real public Cloudflare surface.
3. Mandatory Spike B with an authoritative external acknowledgment.
4. Smallest complete P0 loop.
5. Three distinct external runs.
6. Stop feature work at Definition of Done; harden demo and evidence only.

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
Prioritize one booking loop over breadth: quantity failure → incident → allowlisted SiteSpec patch → exact replay → authoritative booking acknowledgment → fresh ElevenLabs Telegram confirmation when required → deterministic promotion → public Proof Passport → guardian revocation/rollback.

Telegram voice confirmation is core. Buyer voice-note feedback follows the green P0 loop. Outbound Customer Witness calling is stretch-only.

## Engineering rules
- Use npm workspaces because pnpm is unavailable on this host.
- Use TypeScript, Zod, Hono, Vitest, and Playwright as specified.
- Follow strict test-driven development for product behavior: RED, verify failure, GREEN, verify full suite.
- Use official provider documentation and actual installed Hermes interfaces; do not invent APIs.
- Keep Hermes calls behind one thin `hermes_io` boundary plus the repository ProofGate skill.
- Never commit credentials. Keep `.env` ignored and `.env.example` names-only.
- Run the full test suite before reporting a gate complete.
- Update `EVIDENCE.md` as evidence lands, including failures and truthful fallbacks.
