# Live acceptance checklist

Use only the account owner's bakery data, WhatsApp identity, and self/test lead. Run `npm run acceptance:preflight` first. A green preflight means required tools and variable names are present; it is not live proof.

## 0. Foundation receipts

- [x] Convex development and production deployments exist; schema/functions were deployed to each with typechecking on 2026-08-08.
- [x] The named Cloudflare Worker, KV namespace, production Convex configuration, Meta POST/send secrets, and foundation Hermes quick-tunnel origin have control-plane receipts. This is not a durable onboarding origin.
- [x] The no-card Convex File Storage fallback is deployed with immutable metadata validation, a 16 MiB cap, magic-byte checks, and merchant/backend collision rejection; R2 is not claimed.
- [x] Public Worker HTTPS, foundation proof, and the exact WhatsApp GET challenge succeeded. A refreshed signed synthetic Worker-to-Hermes POST returned 200 on 2026-08-09; no live inbound Meta message has been accepted yet.
- [x] Meta registered the test sender and accepted one approved template; its test-webhook panel recorded `sent` and `delivered` for the same provider message ID on 2026-08-09. This is outbound delivery evidence, not inbound merchant intake.
- [ ] Meta recorded the verified merchant's `START BAKERY` reply and OGG/Opus voice note, but Hermes still reports zero accepted inbound messages. Diagnose and preserve successful Worker/Hermes receipt before clearing this gate.
- [ ] Meta verifies `GET /whatsapp/webhook`; one signed ordinary message reaches Hermes unchanged.
- [ ] AWS stack receipt identifies the encrypted instance, EBS volume, and private 30-day recordings bucket.
- [x] Local Hermes reports exactly `v0.18.2`, the repository skill is linked/enabled, and the official Cloud adapter is configured. Its local health returns 200 with signature/verify configuration present and zero accepted messages.
- [ ] Hermes is running on the approved host behind a named tunnel/custom origin. A local foreground gateway and quick tunnel are currently reachable for foundation testing only; they do not satisfy this gate.
- [x] The Vapi test squad was inspected in-provider on 2026-08-08: consent member artifacts are off, qualification member recording/logging/transcript are on, and the active imported number supports the US test country. No call has been placed.

Record IDs and provider receipts in `EVIDENCE.md` without copying secrets, phone numbers, recordings, or raw WA-IDs.

Foundation-only storage receipt: synthetic 1×1 PNG `foundation_asset_verified_20260808`
inserted once, replayed idempotently, and remained HTTP 404 publicly because no promoted
production spec selects it. It is not merchant acceptance. Failed-registration test
uploads may remain as unregistered Convex storage orphans and require cleanup.

## 1. Intake

- [ ] From the bound merchant WhatsApp account, send three original bakery photos, product prices, and one English voice note.
- [ ] Confirm Hermes transcribes uncertain details instead of inventing them.
- [ ] Confirm three private immutable storage assets and a valid `BusinessBriefV1`/`SiteSpecV2` candidate exist. For the foundation fallback, storage IDs and raw Convex file URLs must remain server-side.

Pass evidence: inbound Meta message IDs, redacted Hermes trace, asset hashes, candidate version and spec hash.

## 2. Verify, approve, publish

- [ ] Mint the single-use verifier capability and run Playwright against the public canary URL.
- [ ] Preserve the report hash and ensure there are no open blockers.
- [ ] Request release, tap the signed approval button as the bound merchant, then run `npm run proofgate -- guardian release`.
- [ ] Open `https://<worker>.workers.dev/s/<site-id>` on mobile and match its version/spec-hash headers to the release.

Pass evidence: canary URL, verifier run/report hashes, Meta approval message/tap IDs, release row, public production headers.

## 3. Tracked order CTA

- [ ] Tap one product CTA on the published page.
- [ ] Confirm the redirect opens the separate order WhatsApp number with the exact item message.
- [ ] Run `npm run proofgate -- metrics <site-id> 1`; confirm at least one raw view and click without an IP address.

A redirect or click is not an order. Pass evidence: sanitized redirect location and append-only event IDs.

## 4. Self/test call

- [ ] Register only the user's self/test number with purpose-specific consent evidence and India/US country data.
- [ ] Create one immutable one-attempt batch, inspect its scope, and approve its signed button.
- [ ] Run `npm run proofgate -- guardian calls` once. First test: decline recording and confirm the call ends without recorded artifacts. Second test uses a new approved self/test batch: grant recording consent and confirm the qualification assistant identifies itself as AI.
- [ ] Confirm an authenticated Vapi end-of-call report stores only the structured outcome. Test “do not call” only if desired; it must revoke the lead immediately.

Pass evidence: approval/batch hashes, provider call IDs, redacted artifact settings and structured outcomes. Never put a raw recording or transcript in this repository.

## 5. Reel returned privately

- [ ] Hermes proposes three structured angles; the merchant chooses one and approves its exact plan hash.
- [ ] Run `npm run proofgate -- guardian reel`, synthesize Polly voice, render with the approved photos, and retain the `ffprobe` result.
- [ ] Upload the verified MP4 as an immutable asset.
- [ ] Return it through Meta and atomically record the provider receipt:

```sh
npm run proofgate -- deliver-reel <reel-id> <rendered-asset-id> <merchant-wa-id> "Your approved reel" --submit
```

Pass evidence: plan/asset hashes, Polly voice ID, 1080×1920 H.264/AAC 12–18 second probe, Meta media/message IDs. Do not publish the reel.

## 6. Metrics and one improvement

- [ ] Ask Hermes for `npm run proofgate -- metrics <site-id> 7`; report raw views, CTA clicks, denominator, and exact time window only when activity exists.
- [ ] Request an improvement immediately for acceptance. Hermes creates exactly one new immutable `SiteSpecV2` candidate; it does not edit page code or publish.
- [ ] Repeat verification and signed release approval, run the release guardian, and confirm production changes to the exact approved version while the prior certified version remains available for rollback.

Pass evidence: before/after version and spec hashes, raw metric denominator, proposed change, verifier report, approval tap, release record, production headers.

## Stop conditions

Stop rather than simulate if a provider credential, signed webhook, public canary, bound merchant tap, consent record, Vapi artifact setting, FFmpeg probe, or live provider receipt is missing. Real non-test calls remain blocked pending independent India/US telecom readiness.
