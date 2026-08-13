# Meta WhatsApp webhook setup

Current UI stop on 2026-08-08: new app `ProofGate` is at final Overview with only
**Connect with customers through WhatsApp** selected and unverified portfolio
`ProofGate` connected. Meta showed no additional requirements. The final **Create app**
button accepts the Platform Terms and Developer Policies and remains unclicked. The
configuration below is therefore a handoff, not evidence of an app, secret, phone
number, webhook registration, or message.

Audit date: 2026-08-08 IST. This checklist contains no credential values and does not
claim a signed Meta webhook POST.

## Exact Meta UI entries

In the Meta app's WhatsApp webhook configuration, enter:

| Meta field | Value |
|---|---|
| Callback URL | `https://proofgate-whatsapp-growth.proofgate-harshita.workers.dev/whatsapp/webhook` |
| Verify token | The exact secret value stored on the Worker as `META_VERIFY_TOKEN` |
| Webhook object | WhatsApp Business Account |
| Subscribed webhook field | `messages` |

The verify token is an operator-generated shared secret; it is not the Meta App Secret.
Click **Verify and save**, then ensure the app is subscribed to the intended WhatsApp
Business Account and its `messages` field.

From the app/WhatsApp API setup, map these provider values to Worker secrets without
committing them:

| Meta source | Worker secret/binding | Required for |
|---|---|---|
| App Secret | `META_APP_SECRET` | Verifying `X-Hub-Signature-256` on every webhook POST |
| Operator-chosen verify token | `META_VERIFY_TOKEN` | Meta's GET verification handshake |
| WhatsApp Phone Number ID | `META_PHONE_NUMBER_ID` | Approval buttons, templates, and reel delivery |
| Access token authorized for that number | `META_ACCESS_TOKEN` | Approval buttons, templates, and reel delivery |
| Approved action-required template name | `META_ACTION_REQUIRED_TEMPLATE` | Optional messages outside the 24-hour window |

The committed non-secret Graph version is `META_GRAPH_API_VERSION=v26.0`. The template
adapter currently sends language code `en`; any configured action-required template
must have that approved language variant.

## Worker behavior being registered

- `GET /whatsapp/webhook` returns `hub.challenge` only when `hub.mode=subscribe` and
  `hub.verify_token` matches `META_VERIFY_TOKEN`; otherwise it returns 403.
- `POST /whatsapp/webhook` hashes the exact raw request body with `META_APP_SECRET` and
  rejects a missing/invalid `X-Hub-Signature-256` with 401.
- Signed `pg:<approval-id>:approve|deny` button taps are sender-bound and resolved
  directly against Convex.
- Other signed messages, photos, and voice notes are forwarded as the same raw bytes to
  `${HERMES_ORIGIN_URL}/whatsapp/webhook`, preserving the Meta signature and adding the
  private `HERMES_PROXY_SECRET` header.

## Hermes Cloud adapter boundary

Installed Hermes `v0.18.2` contains both adapters. `hermes whatsapp` configures the
unofficial Baileys bridge; it does not satisfy this product's Meta Cloud requirement.
`hermes whatsapp-cloud` is the interactive setup command for the official adapter.
There is no `whatsapp-cloud setup` subcommand.

Hermes enables `whatsapp_cloud` only when both of these exist in its own `.env`:

- `WHATSAPP_CLOUD_PHONE_NUMBER_ID`
- `WHATSAPP_CLOUD_ACCESS_TOKEN`

For a safe inbound path also set:

- `WHATSAPP_CLOUD_APP_SECRET` — Hermes independently verifies the preserved raw-body
  `X-Hub-Signature-256`; without it, POSTs are refused with 503.
- `WHATSAPP_CLOUD_ALLOWED_USERS` — exact test wa_ids, digits only during restricted
  testing. Without an allowlist, inbound messages are denied by the documented setup.
- `WHATSAPP_CLOUD_VERIFY_TOKEN` — keep aligned with the Worker token for diagnostics,
  although ProofGate's public GET handshake terminates at the Worker.

`WHATSAPP_CLOUD_WABA_ID` and `WHATSAPP_CLOUD_APP_ID` are optional metadata in this
Hermes release. Defaults are host `0.0.0.0`, port `8090`, path
`/whatsapp/webhook`, and Graph version `v20.0`; the Worker remains on its separately
configured Graph version for outbound product messages.

For a reviewed production app, explicitly use Cloud DM policy `open` only behind the
signed Worker webhook. The Worker derives and enforces tenant identity and Hermes keeps
one session per authenticated WA-ID. In Meta development mode, this remains limited to
OTP-approved test recipients and is not public onboarding.

Exact installed lifecycle commands are:

```sh
hermes whatsapp-cloud
hermes gateway run
```

On the approved Linux host, configure as the `proofgate` user, install without starting,
then explicitly start only after the private origin check succeeds:

```sh
sudo -u proofgate -H hermes whatsapp-cloud
sudo hermes gateway install --system --run-as-user proofgate --no-start-now --start-on-login
sudo hermes gateway start
sudo -u proofgate -H hermes gateway status
```

The installed Hermes adapter does **not** inspect `X-ProofGate-Proxy`.
`HERMES_PROXY_SECRET` is therefore not origin authentication by itself: a named-tunnel
Access policy or a reverse proxy in front of Hermes must validate it before traffic can
reach port `8090`. Hermes then performs the second, independent Meta HMAC check. A quick
tunnel without origin enforcement remains foundation testing only.

## Runtime audit and blockers

The named Worker, production `CONVEX_URL`, `META_GRAPH_API_VERSION`, and
`PROOFGATE_CONFIG` KV binding are committed/deployed according to the existing control
plane receipts. R2 is intentionally absent and is not needed for webhook registration;
the current asset fallback is Convex File Storage.

Authenticated Wrangler recheck confirmed these remote Worker secret names (values were
not read or recorded):

- `HERMES_PROXY_SECRET`
- `META_VERIFY_TOKEN`
- `PROOFGATE_DATA_KEY`
- `PROOFGATE_SERVICE_SECRET`
- `VAPI_API_KEY`
- `VAPI_PHONE_NUMBER_ID`
- `VAPI_SQUAD_ID`
- `VAPI_WEBHOOK_SECRET`

Required remote Meta secrets `META_APP_SECRET`, `META_PHONE_NUMBER_ID`, and
`META_ACCESS_TOKEN` are absent. A KV read for `hermes_origin` returned 404 Not Found,
and there is no `HERMES_ORIGIN_URL` Worker value. Thus the live GET challenge can pass,
but signed Meta POST verification, Meta sends, and forwarding ordinary messages to
Hermes are not ready.

Local `.env` contains the expected variable names, but the acceptance preflight reports
the Meta and Hermes values empty. It also selects a non-production
Convex URL locally; this does not change the committed production Worker binding.

`HERMES_ORIGIN_URL` (or KV key `hermes_origin`) and `HERMES_PROXY_SECRET` must be live
before testing an ordinary inbound message. The stable origin must enforce that secret
or an equivalent Cloudflare Access service credential before proxying to Hermes;
otherwise the header is merely forwarded and provides no origin restriction. A quick
tunnel is for foundation testing only; use an authenticated named tunnel or stable
custom origin before external merchant onboarding.

## Acceptance boundary

After **Verify and save** succeeds, send one ordinary message from the account owner's
test WhatsApp identity only after Hermes is reachable. Preserve the Meta message ID,
redacted Worker/Hermes receipt, and HTTP outcome. Then test one real approval button
from the bound merchant identity. Do not record signed-POST acceptance merely from the
previous synthetic GET challenge or unit tests.

Focused local verification on the audit date: 19 webhook/integration tests passed,
including valid and invalid Meta signatures, raw-body forwarding, approval interception,
and provider client behavior. These are code facts, not live Meta evidence.
