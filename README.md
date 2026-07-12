<div align="center">

# ⚕ ProofGate

### The independent release authority for AI-built buyer journeys.

*Your AI-built selling page should have to **prove it works** — before it goes live.*

![Track](https://img.shields.io/badge/track-AI%20as%20Agency-bd4c2f)
![Built on Hermes](https://img.shields.io/badge/built%20on-Hermes%20(Nous)-22251f)
![Tests](https://img.shields.io/badge/tests-32%20passing-4a9a41)
![Proof loop](https://img.shields.io/badge/proof%20loop-green-4a9a41)
![Gate](https://img.shields.io/badge/promotion-deterministic%20policy-4a9a41)

**[▶ Live demo](https://rides-min-logos-finger.trycloudflare.com)** · **[Build Bible](PROOFGATE_BUILD_BIBLE.md)** · **[Demo runbook](DEMO_RUNBOOK.md)**

</div>

---

## The problem

Anyone can now generate a website from a prompt. Nobody checks whether a real buyer can actually **finish the purchase** on it. AI-built pages look done and silently break at checkout — wrong quantity, a dead CTA, a confirmation that never arrives. The site ships; the sale doesn't.

## What ProofGate does

ProofGate is a **team of agents that replaces a launch operations function** — and refuses to approve its own work.

A merchant sends a voice note and photos. An agent crew builds the selling page and compiles the buyer's intention — *"book two seats on mobile and receive a confirmation"* — into an **executable contract**. An **independent verifier** attempts that exact journey. Any failure becomes a **permanent regression test**, a failure-specific **specialist is spawned** to repair the page, and **only deterministic policy code** promotes it to production — after a real booking/payment event witnesses the path. The public **Proof Passport** stays **revocable**: cron replays the contracts and flips it amber/red on regression, then repairs or rolls back.

> The builder cannot approve its own work. The verifier cannot change the page. Only deterministic policy code turns a passport green.

## Why this is not "just prompting"

A prompt to Claude/GPT/v0/Lovable emits a *candidate*. ProofGate owns the *release*:

| A prompt | ProofGate |
|---|---|
| Reads and **guesses** it looks right | **Executes** the buyer journey — the interpreter, not the model, says pass/fail |
| One model, one shot | **Capability-separated** crew: builder ≠ verifier ≠ release authority |
| No durable state | Versioned specs, contracts, evals, incidents, provenance |
| Certifies on vibes | **Only deterministic code promotes** — no model call turns a passport green |
| Forgets the failure | Every failure becomes a **permanent regression test** it can never regress on |

The defensible unit isn't generated code — it's the **growing set of real buyer failures the business can never ship again.**

## How it works

```
  voice brief ─► Cloudflare CANARY ─► buyer contract compiled
                                          │
                                          ▼
                            independent verifier (no deploy/pay keys)
                                          │  FAIL
                        ┌─────────────────┴─────────────────┐
                        │  failure → permanent eval          │
                        │  specialist spawned → SiteSpec patch│
                        │  new immutable version              │
                        └─────────────────┬─────────────────┘
                                          │  EXACT replay ─► PASS
                                          ▼
                        real external event  (booking / payment)
                                          │
                             ┌── deterministic release authority ──┐
              acknowledged?  │  false → BLOCK · amber              │
                             │  true  → PROMOTE · green            │
                             └──────────────────┬─────────────────┘
                                          ▼
                              PRODUCTION + green Proof Passport
                                          ▲
                     Hermes cron replays contracts ─► regression ─► amber/red ─► repair/rollback
```

## Quick start

```bash
npm install

npm run demo     # the full proof loop, in-process, deterministic — prints the timeline below
npm test         # 32 green: 3 legacy + 29 unit (release gate, oracle, verifier separation, repair)
npm start        # serve the live merchant page + Proof Passport at http://localhost:4173
```

### `npm run demo` — real output, not a mock

```
[03] (c) verifier runs contract "book 2 seats"   → FAILED (QUANTITY_UNSUPPORTED, page supports 1)
[04] (d) failure captured as eval + repair specialist spawned (role absent at kickoff)
[05] (e) specialist patches a Zod-validated SiteSpec → new immutable version (qty_max=2)
[06] (f) EXACT same contract re-runs             → PASSED
[07] (g) release gate, identical facts:
            acknowledged=false → BLOCK  · passport amber (EXTERNAL_ACKNOWLEDGMENT_PENDING)
            acknowledged=true  → PROMOTE· passport GREEN (EXACT_EXTERNAL_ACKNOWLEDGMENT)
[08] (h) GREEN — certified version repaired-qty2-v2 · promoted by deterministic policy, not a model
```

## Architecture

Monorepo — the agency's organs, each capability-scoped:

| Path | Role |
|---|---|
| `packages/domain` | SiteSpec (Zod) + immutable, hash-verified site versions |
| `packages/renderer` | the one constrained, production renderer — agents only touch validated specs |
| `packages/contract-runner` | compiles buyer intentions into executable contracts |
| `packages/release-policy` | **release authority** (deterministic promote gate), external oracle, quantity repair |
| `packages/hermes-io` | Hermes/Telegram boundary |
| `apps/verifier-runner` | capability-separated verifier (holds **no** deploy/payment/promotion keys) |
| `apps/edge-runtime` | Cloudflare Worker — canary/production sites + Proof Passport |
| `apps/spike-b-dispatcher` | external-event witness path |
| `convex/` | durable state: specs, contracts, runs, events, evals, incidents, passport |
| `scripts/demo-loop.mjs` | the end-to-end proof loop (`npm run demo`) |

**Capability separation (enforced, not named):** the builder can write specs but not promote; the verifier can run journeys but not write; the release authority can promote but not generate. A mentor asking *"can the builder approve itself?"* is shown the guard, not a promise.

## Stack & partners

**Runtime:** TypeScript · Node · Hono · Zod · Vitest · Playwright
**Power-ups (AI as Agency):** **Convex** (all product state) · **Cloudflare** (deploys + passport) · **Linkup** (claim verification) · **ElevenLabs** (voice intake + confirmations) · **Wispr Flow** (build)
**Runs on:** [Hermes](https://github.com/nousresearch/hermes-agent) — gateway intake, subagent delegation, cron guardian, persistent memory.

## Rubric map — AI as Agency

| Parameter | How ProofGate earns it |
|---|---|
| **Real output** (20×) | Real merchant page + real external event; launches *and* guardian incidents count as tasks |
| **Agent org** (5×) | Manager plans per-brief; **specialist spawned from a live failure** |
| **Observability** (7×) | Per-run trace + cost; red-vs-green diff; regression alert = passport flip |
| **Evals** (5×) | Every failure auto-becomes a versioned, release-blocking contract |
| **Memory** (2×) | Now (task) + history (this merchant's failures) + policy (rules) across handoffs |

## Status

| Area | State |
|---|---|
| Live merchant page + Proof Passport (touchable) | 🟢 live |
| End-to-end proof loop (`npm run demo`) | 🟢 deterministic, tested |
| Capability separation + deterministic gate | 🟢 enforced + covered by tests |
| Spike A (real Cloudflare Worker render) · Spike B (booking oracle green on consented merchant) | 🟢 passed |
| Telegram voice intake → live generation · production Cloudflare deploy | 🟡 target |
| Dodo live payments · ElevenLabs · Linkup | 🟡 pending credentials — **not claimed until wired** |

## Truthfulness

ProofGate never presents a mock, sandbox event, teammate payment, or prerecorded audio as live proof. Failures are preserved, never deleted to inflate a success rate. Real offers map to real deliverables; merchant and buyer consent is logged. Every scoring claim points to an inspectable artifact — see [EVIDENCE.md](EVIDENCE.md).

## Docs

- **[PROOFGATE_BUILD_BIBLE.md](PROOFGATE_BUILD_BIBLE.md)** — full spec & execution brief (30 sections)
- [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md) — system architecture, pipelines, trust boundaries
- [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) — judging demo, beat by beat
- [EVIDENCE.md](EVIDENCE.md) — the claim ledger
- [docs/privacy-and-consent.md](docs/privacy-and-consent.md) · [docs/provider-evidence.md](docs/provider-evidence.md)

---

<div align="center">
Built for the <b>GrowthX × Nous Research — World's Largest Hermes Buildathon</b> · AI as Agency.
</div>
