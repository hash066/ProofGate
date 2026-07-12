# Privacy & Consent

## Merchant consent (collect BEFORE building their site — paste into Telegram, log reply in Convex `merchants.consent`)

> Hi! ProofGate will build and publish a one-page site for your business from what you send us (photos, prices, voice notes), test it with automated "buyer" checks, monitor it, and show it (including during a judged demo today). You can ask us to take it down anytime. Any test payments are refunded or honored as real orders — your choice. Reply **YES** to proceed.

Log: merchant name · Telegram id · timestamp of YES · takedown requested (if any).

## Buyer/judge consent
Demo buyers are told the checkout is real before paying. Real payments map to real deliverables (bible §12) or are refunded same-day. Record which in `external_events.notes`.

## Data handling
- We store only what the merchant sent + generated configs + run evidence. No scraping of third parties beyond public claim verification (Linkup).
- Buyer PII in runs: verifier identities are synthetic; real buyer contact stored only for confirmation delivery, redacted on the public passport.
- Takedown: unpublish site + passport within the hour; retain internal evidence rows (they contain no public PII).
