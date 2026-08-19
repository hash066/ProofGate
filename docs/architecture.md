# WhatsApp growth architecture

## Trust boundaries

```text
Merchant WhatsApp
  -> Cloudflare Worker (Meta signature + sender-bound approvals)
     -> ordinary media/text/voice unchanged -> Hermes v0.18.2 on AWS
        -> one isolated session per authenticated WA-ID
        -> Worker-derived opaque merchant ID; models cannot choose tenant identity
        -> active merchant decision policy
           -> reversible drafts/verification/metrics: allow without another prompt
           -> publish/call/final reel: exact signed approval
           -> prohibited action: deny
        -> typed proofgate CLI -> authenticated Worker admin routes -> Convex File Storage
     -> public site / tracked CTA / Proof Passport

Convex immutable candidate -> independent verifier -> deterministic release policy
                                                -> production pointer / passport

Approved call batch -> atomic guardian claim -> Vapi consent squad -> qualification squad
                                                     -> signed structured outcome -> Convex

Approved reel -> atomic guardian claim -> AWS Polly + FFmpeg -> ffprobe -> private storage/WhatsApp

Studio reel profile -> selected immutable merchant assets -> owner-authorized Remotion composition -> H.264/AAC verification -> private storage/WhatsApp. The adapter maps the five constrained Axcas format IDs to code-owned compositions and never accepts arbitrary public URLs or paths outside the approved asset root.

Three reel variants -> one immutable social-campaign hash -> one merchant approval
                   -> Instagram publishing remains disabled until provider readiness
                   -> 2h/24h/72h normalized metrics -> winner or insufficient signal

Merchant browser -> Axcas Studio (Website / Reels / Both)
  -> short-lived browser nonce + prefilled AXCAS LINK message
  -> Meta-signed sender claim -> HttpOnly merchant session
  -> append-only project revisions + private reference uploads
  -> constrained site layout / reel style profile -> same verifier and approval gates
```

Hermes can interpret multimodal input and propose typed artifacts. It has no Convex mutation or release credential. The builder cannot verify, the verifier cannot mutate or promote, and passport state is derived from immutable version, hash, contract, approval, and release facts.

`DecisionPolicyV1` is created once at onboarding and stored as an append-only merchant record. A deterministic evaluator, not the model, returns `allow`, `require_approval`, or `deny`. Fast-pilot policy removes repeated prompts for reversible work while preserving exact hash-bound approvals for release, calls, and final reel rendering. Updating preferences appends a policy that explicitly supersedes the active version.

## Data flow

- `BusinessBriefV1` binds the hashed owner, inferred SME type, separate order number, business facts, and product/service draft.
- The public intake accepts business fields only. The Worker normalizes and hashes the authenticated Meta sender, then injects its deterministic opaque merchant ID. Every later merchant route rejects a mismatched tenant before mutation.
- Site slugs have an immutable merchant owner. Assets receive a tenant-prefixed canonical ID, while metrics, verification capabilities, releases, calls, reels, and campaigns resolve only inside that tenant.
- Photos enter the hardened Convex File Storage foundation fallback under immutable asset IDs. The 16 MiB policy verifies magic bytes plus storage metadata SHA/size/type and rejects merchant/backend collisions. Raw storage URLs remain server-side; the public asset route resolves only IDs selected by a published spec. R2 remains an optional later backend.
- `SiteSpecV2` is canonicalized and hashed. The renderer treats every field as untrusted text and emits no merchant scripts.
- `theme.layout` selects one of five code-owned renderers (`minimal`, `editorial`, `catalog`, `services`, or `portfolio`). Merchants edit validated data and visual choices, never page code.
- Studio authentication has no customer password or provider key. A ten-minute browser-bound nonce is claimed only by a valid Meta-signed `AXCAS LINK` message, then exchanged for a hashed, 30-day, Secure HttpOnly SameSite session. Projects are append-only revisions and uploads reuse the same tenant-scoped immutable storage boundary.
- Page views and CTA clicks are append-only. A random first-party session value is hashed before ingestion; IP addresses are not stored.
- The tracked CTA resolves the published version/item, records source and campaign, then redirects to the exact prefilled `wa.me` message.
- Approval taps are accepted only from a valid Meta-signed body, a pending unexpired approval, and the bound merchant sender hash.
- Scraping leads, accepting payments, automatic social posting, and publishing synthetic product media are denied regardless of merchant policy.
- The social experiment boundary accepts exactly three distinct reel assets and schedules under one scope hash. It scores watch, meaningful-engagement, and CTA-click rates against raw reach at 2, 24, and 72 hours. This removes repeated approvals while keeping provider publication disabled until an Instagram Professional account and scoped token are verified.

## Call safety

`LeadConsentV1` permits only India/US, a single qualification purpose, consent evidence, and a local calling window. The batch hash includes the exact lead IDs, countries, script version, time window, attempt limit, and cost cap. The guardian atomically stamps `dispatchedAt` before contacting Vapi, preventing retry-driven duplicate calls.

The consent assistant disables recording, logs, and transcript. The qualification assistant begins only after explicit recording consent, identifies itself as AI, and never accepts payment. A declined recording ends the call; do-not-call revokes the lead immediately. Only structured outcomes and optional private 30-day artifact references persist.

## Reel safety

A plan references supplied asset IDs and claims only. Studio reference uploads become a versioned style profile with one of five clean-room formats, a palette, timing, and bounded text/image/video/shape layers. References are evidence of pacing and layout—not permission to copy another creator's footage, voice, identity, or exact expression. Approval is bound to the canonical plan hash. The AWS worker atomically claims the plan, optionally synthesizes English-India voice with Polly Kajal/Aditi, renders 1080×1920 H.264/AAC from the approved asset root, and checks dimensions/codecs/duration with ffprobe. It returns the file privately and has no social publishing credential.

## Deployment

Cloudflare serves SME sites and the Meta webhook on `workers.dev` and owns KV; public HTTPS, foundation proof, and the GET verification protocol are verified. Convex development and production remain separate, with production holding the scoped File Storage fallback. R2 is inactive, card-blocked, and optional. AWS hosts Hermes/FFmpeg and the private 30-day recording bucket. The durable Worker-to-Hermes path is an authenticated API Gateway ingress into encrypted SQS, consumed by an outbound-only EC2 relay; no public EC2 port or custom domain is required.

Convex, storage fallback, Worker HTTPS, Meta publication, durable AWS Hermes ingress, and GET verification have foundation receipts. Real merchant assets, a production WhatsApp number, and second-merchant production acceptance remain gated. Exact receipts and verification state belong in `EVIDENCE.md`.
