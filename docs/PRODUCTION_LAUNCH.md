# Axcas production launch

## Customer promise

Customers never provide API keys, access tokens, cloud credentials, or developer
accounts. They send normal WhatsApp text, photos, voice notes, and an order/contact
number. Axcas owns and operates the Meta app, Cloudflare Worker, Convex project,
Hermes host, Vapi integration, and provider secrets.

Future Instagram publishing must use a standard Meta OAuth consent screen. A merchant
clicks **Connect Instagram** and can revoke access later; Axcas must never ask them
to paste a token into WhatsApp.

All customer-submitted business schemas are strict. Unknown credential-like fields
are rejected rather than stored.

## Production topology

| Layer | Production home | Purpose |
|---|---|---|
| Edge | Cloudflare Worker | Public sites, tracked WhatsApp redirects, signed webhooks |
| State and private media | Convex production | Tenant state and current no-R2 private asset storage |
| Agent and rendering | AWS `ap-south-1` Ubuntu `t3.small` | Pinned Hermes, FFmpeg, scheduled reports |
| Recordings | Private encrypted S3 | Consented call artifacts, deleted after 30 days |
| Origin path | Named Cloudflare Tunnel | Authenticated Worker-to-Hermes ingress with no public EC2 port |

Hermes and FFmpeg now run on the encrypted AWS instance. The Worker currently reaches
that host through an AWS-side Cloudflare quick tunnel. This is suitable for controlled
testing, but the random tunnel URL is not a durable customer-onboarding origin. Replace
it with the staged named tunnel route before unrestricted onboarding.

## Smallest launch sequence

1. [Done] Deploy the encrypted AWS foundation in `ap-south-1` and install a pinned repository revision through SSM.
2. [Done] Configure Hermes `v0.18.2`, FFmpeg, the official WhatsApp Cloud adapter, and the authenticated loopback origin.
3. Connect the staged named Cloudflare Tunnel to the authenticated loopback origin on port `8080`, run it as a service, and rotate the Worker origin.
4. Store only ProofGate operator secrets on the host and Worker; never merchant keys.
5. Connect the production WhatsApp number and complete Meta production requirements.
6. Run one real merchant from natural message to checked preview, approval,
   published page, tracked CTA, reel delivery, and metrics report.
7. Keep calls and social auto-posting disabled until their separate live acceptance
   and compliance gates pass.

## Commercial starting point

Launch the first twenty customers as **Founding Pilot**:

- ₹999 one-time onboarding
- ₹499/month
- one verified product/service page
- WhatsApp-controlled updates and metrics
- one approved reel per month
- provider usage above the included allowance billed separately at cost

Keep outbound calls, paid marketing templates, advertising spend, and automatic social
posting outside this base plan. After three public case studies, add an optional
₹999/month Growth plan with additional reels and experiments; preserve the ₹499 Starter
plan for price-sensitive merchants.
