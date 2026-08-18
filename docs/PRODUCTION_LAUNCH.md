# Axcas production launch

## Customer promise

Customers never provide API keys, access tokens, cloud credentials, or developer
accounts. They may send normal WhatsApp text, photos, voice notes, and an order/contact
number, or open Axcas Studio and link the browser with one prefilled WhatsApp message.
Axcas owns and operates the Meta app, Cloudflare Worker, Convex project, Hermes host,
Vapi integration, storage, rendering, and provider secrets.

Initial site onboarding asks at most one consolidated factual question and has exactly
one approval: publish the checked preview. Transcription, business-type inference,
private storage, drafting, candidate creation, and verification are automatic. Calls,
reel rendering, and social campaigns are separate optional actions and are not mixed
into site onboarding.

Studio starts with one choice—Website, Reels, or Both—and uses guided layouts and
layer controls rather than a blank Wix-style canvas. The credential is a browser-bound,
short-lived WhatsApp link exchanged for a Secure HttpOnly session; there is no customer
password database to breach or reset.

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
| Origin path | AWS API Gateway + encrypted SQS | Authenticated Worker-to-Hermes ingress with no public EC2 port |

Hermes and FFmpeg run on the encrypted AWS instance. The Worker reaches that host
through a stable AWS API Gateway endpoint which authenticates the Worker and places the
unchanged Meta envelope in encrypted SQS. An outbound-only relay forwards it to Hermes.
The temporary quick tunnel is disabled.

## Smallest launch sequence

1. [Done] Deploy the encrypted AWS foundation in `ap-south-1` and install a pinned repository revision through SSM.
2. [Done] Configure Hermes `v0.18.2`, FFmpeg, the official WhatsApp Cloud adapter, and the authenticated loopback origin.
3. [Done] Deploy the authenticated API Gateway/SQS relay and rotate the Worker origin to it.
4. [Done] Store only Axcas operator secrets on the host and Worker; never merchant keys.
5. [Done in code] Deploy Axcas Studio, WhatsApp-linked sessions, private uploads, five site layouts, five human-led reel formats, and checklist approvals.
6. Connect the production WhatsApp number and complete Meta phone/OTP requirements.
7. Run one real merchant from natural message to checked preview, approval,
   published page, tracked CTA, reel delivery, and metrics report.
8. Keep calls and social auto-posting disabled until their separate live acceptance
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
