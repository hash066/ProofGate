# ProofGate

**Your AI-built selling page should have to prove it works.**

A merchant sends a voice note and photos on Telegram. ProofGate builds the selling page, compiles buyer intentions into executable contracts, and refuses to release until an independent verifier completes the journey and a real payment, booking, or delivered lead proves it works. After launch, Hermes cron keeps replaying those contracts — the public Proof Passport is revocable, not decorative.

The builder cannot approve its own work. The verifier cannot change the page. Only deterministic policy code turns a passport green.

Built on [Hermes](https://github.com/nousresearch/hermes-agent) for the GrowthX Hermes Buildathon — **AI as Agency** track.

## Single source of truth

**[PROOFGATE_BUILD_BIBLE.md](PROOFGATE_BUILD_BIBLE.md)** — the complete spec and execution brief (30 sections). Hermes kickoff prompt: bible §29. Milestone-scoped agent instructions: [AGENTS.md](AGENTS.md).

## Working documents

- [docs/SYSTEM_ARCHITECTURE.md](docs/SYSTEM_ARCHITECTURE.md) — complete system architecture, workflow pipelines, trust boundaries and current implementation status

- [EVIDENCE.md](EVIDENCE.md) — claim ledger (bible §26 format), filled during the build
- [DEMO_RUNBOOK.md](DEMO_RUNBOOK.md) — judging demo companion (beats: bible §21, fallbacks: §22)
- [docs/architecture.md](docs/architecture.md) — as-built record (spec: bible §5–§13)
- [docs/privacy-and-consent.md](docs/privacy-and-consent.md) — consent templates (policy: bible §16)
- [docs/provider-evidence.md](docs/provider-evidence.md) — power-up earn checklist (spec: bible §17, §24)
- `.env.example` — key names per bible §17; copy to `.env` (gitignored) and fill

## Status

- Milestone 1 (local scaffold: renderer + booking page + tests) — shipped via Codex, see AGENTS.md
- Pre-event provider readiness (bible §17) — **in progress; Dodo live-mode activation has days of lead time, start first**
