# Hermes capability matrix

Recorded at build start: **2026-07-12 13:11 IST**  
Session: `20260712_130611_5d7887`  
Authoritative references checked from the current Hermes upstream docs: Telegram, delegation, cron, and memory pages (source hashes retained below).

| Capability | Live finding | Product use / constraint |
|---|---|---|
| Hermes version | `v0.18.2 (2026.7.7.2)`, upstream `4d611ba0`; doctor passes with one configuration warning | Pin this exact runtime in evidence; one update is available but is not required for build start. |
| Model/provider | `gpt-5.6-sol` through OpenAI Codex OAuth | Build-time agent only; product state must not depend on model judgment. |
| Telegram gateway | Hermes reports Telegram **configured**; gateway currently stopped; no project-level token/home-channel variables are present | Start gateway when intake/dispatch testing begins. Do not claim pairing/home-channel delivery until a real message receipt is observed. |
| Incoming voice transcription | `stt.enabled=true`; provider auto-selection not explicitly pinned | Record the actual provider receipt on the first real voice note. Hermes STT is not ElevenLabs power-up proof. |
| TTS / audio | Hermes `tts` tool available; default appears to be Edge; ElevenLabs is not configured | Core ProofGate voice clause is blocked until `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` are supplied and a live health clip succeeds. |
| Delegation | Tool enabled; max concurrent children `3`; max spawn depth `1` | Use isolated leaf verifier/analyst roles with minimal toolsets. Child agents cannot send messages, mutate memory, or promote. |
| Child execution | Local terminal/file/browser toolsets are available subject to per-child restriction | Verifier runner remains a separate Node process with an explicitly scrubbed environment. |
| Browser | Hermes doctor finds `agent-browser` and Playwright Chromium; browser tool is enabled; desktop auto-launch failed once before this build | Spike A uses repository Playwright directly and fresh contexts; preserve browser failures. |
| Messaging | Telegram configured through gateway; no generic messaging tool is exposed in this desktop session | Use the documented Hermes gateway/CLI adapter and store the resulting platform receipt; do not invent SDK calls. |
| Cron | Cron support installed; zero jobs; gateway stopped, so scheduled jobs cannot fire | Create guardian only after P0. Attach the ProofGate skill and absolute workdir; label manual runs manual. |
| Memory | Built-in memory active, no external provider | Use only for compact operational lessons. Convex remains authoritative product state. |
| Skills | Active path `C:/Users/Rayyan Shaikh/AppData/Local/hermes/skills`; no ProofGate skill installed yet | Create repository skill, then install/symlink after its scripts exist. |
| Terminal | Local Bash/MSYS on Windows; Node available; npm available; pnpm absent | Use npm workspaces and POSIX shell syntax. |
| Cloudflare CLI | `wrangler` not globally installed; `npx wrangler@latest` works; unauthenticated; temporary public deploy supported | Spike A may use a clearly labeled temporary Cloudflare URL. Final production requires account authentication/token. |
| Convex CLI | `npx convex@latest` works; no deployment configured | Mandatory Spike B and authoritative state are blocked pending Convex project authentication/configuration. |

## Hermes doctor summary

- Security advisories: none.
- Browser engine and Node dependencies: healthy.
- Built-in browser, terminal, file, delegation, cron, memory, skills, TTS tools: available.
- Gateway: stopped.
- Web-search provider keys: absent.
- ElevenLabs: absent.

## Upstream documentation hashes checked

| Document | SHA-256 |
|---|---|
| Telegram | `38ac8b8919a73b18cc5f240e582eb5faa2ee84bc369a4e2a2294f3e6c15c56be` |
| Delegation | `034cde4cb19a196a5a8f91a79503d5b6f0e4ceb820177710834cf9e57d59cc8e` |
| Cron | `8e552cb8bc262ae35192de83a251b13c2d334954cb52853adb01d3b980514a82` |
| Memory | `7ad95de41208c26ad19b5a7d97b345c4743e106268b89a189b5c59f3efb10e79` |

These hashes prove which upstream revisions were inspected; they are not product evidence.
