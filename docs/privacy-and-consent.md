# Privacy and consent

## Merchant

Before intake, explain that ProofGate will process the merchant’s WhatsApp text, English voice notes, and supplied photos; create a public catalog; run automated checks; track anonymous page activity and order-CTA clicks; and privately return reel drafts. Record the authenticated WA-ID hash, consent timestamp, purpose, and takedown status. The merchant’s control number and public order number are separate by default.

The merchant must approve the exact site release, call batch, and reel plan through a signed WhatsApp button. Free-form text is not a substitute. No automatic posting or publishing occurs.

## Leads and calls

- Leads must be supplied by the merchant; scraping and enrichment are prohibited.
- Every lead requires a purpose-specific consent source, evidence hash, grant timestamp, India/US country, local call window, and non-revoked status.
- Batch approval binds exact lead IDs, countries, script, call window, one-attempt limit, cost cap, and 24-hour expiry.
- The first Vapi assistant cannot record, log, or transcribe and asks explicit recording consent. A decline ends politely.
- The qualification assistant begins only after yes, identifies itself as AI, never takes payment, and records only the approved qualification fields.
- “Do not call” immediately records revocation. No future batch may include that lead.
- Consented call recordings are private and encrypted in S3 and expire after 30 days. Only the structured outcome remains afterward.

Real non-test calling stays disabled until India/US telecom and telemarketing readiness is independently confirmed.

## Site analytics and media

Photos remain private in R2 until their immutable IDs are selected in a published spec. Page events use a random first-party session ID hashed at ingestion. ProofGate stores no IP address. Public passports and reports use aggregate counts and redact identities. Reel outputs contain only approved supplied media and are returned privately.

Takedown removes the public site/media promptly while preserving redacted append-only release and consent evidence where legally required.
