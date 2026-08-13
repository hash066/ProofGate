# Cloudflare foundation

Status on 2026-08-08: account authentication succeeded, KV namespace
`PROOFGATE_CONFIG` exists with ID `bfed66f79c9a4e66adf345f4dce3c113`, and Worker
`proofgate-whatsapp-growth` code version `d1c1a59b-761f-4e66-9c2d-3f73ba4289e0` deployed;
the current secret-change deployment is `927f1614-6b2f-42cc-8120-8d143f80ab85`
with production Convex configuration and eight runtime secrets. The account subdomain
and script report enabled. Public HTTPS, the foundation proof route, and the exact
WhatsApp GET challenge now return HTTP 200. R2 is inactive/card-blocked and optional;
Convex File Storage is the verified foundation backend.

Authenticated remote-state audit: Worker secrets present are
`HERMES_PROXY_SECRET`, `META_VERIFY_TOKEN`, `PROOFGATE_DATA_KEY`,
`PROOFGATE_SERVICE_SECRET`, `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `VAPI_SQUAD_ID`,
and `VAPI_WEBHOOK_SECRET`. Missing are `META_APP_SECRET`, `META_PHONE_NUMBER_ID`, and
`META_ACCESS_TOKEN`. KV key `hermes_origin` is absent (404), and no Worker
`HERMES_ORIGIN_URL` is configured. Do not attempt signed inbound forwarding until those
gaps are resolved.

Gateway-origin readiness: official cloudflared `2026.7.3` was downloaded to
`C:\Users\asus\AppData\Local\ProofGate\bin\cloudflared.exe` and its SHA-256 matches
`8635da433b6df8194746e88ed9d2589566c20e38bfc2a80e431a348b7c765841`. It has not been
started. No quick tunnel, named tunnel, DNS origin, or Hermes reachability is claimed.

The commands below match the installed Wrangler CLI. Run them only after the account
owner completes `npx wrangler login` and confirms the intended Cloudflare account.

```powershell
# Confirm the account before any mutation.
npx wrangler whoami

# Optional future backend after R2 billing is activated. Convex File Storage is the
# current 16 MiB foundation fallback; do not run this merely to satisfy a checklist.
npx wrangler r2 bucket create proofgate-private-assets `
  --config apps/edge-runtime/wrangler.jsonc `
  --binding PROOFGATE_ASSETS `
  --update-config

# Already completed on 2026-08-08. Retained for disaster recovery/new accounts only.
npx wrangler kv namespace create PROOFGATE_CONFIG `
  --config apps/edge-runtime/wrangler.jsonc `
  --binding PROOFGATE_CONFIG `
  --update-config

# Validate the resulting bundle before deploying the named Worker.
npx wrangler deploy --config apps/edge-runtime/wrangler.jsonc --dry-run
npx wrangler deploy --config apps/edge-runtime/wrangler.jsonc
```

Do not replace the committed real KV ID with a placeholder. For a deliberate account
migration, `--update-config` must write the newly created account resource ID.

Set these values with `npx wrangler secret put NAME --config
apps/edge-runtime/wrangler.jsonc`; never commit their values:

- `CONVEX_URL`
- `META_APP_SECRET`, `META_VERIFY_TOKEN`, `META_PHONE_NUMBER_ID`, `META_ACCESS_TOKEN`
- `HERMES_ORIGIN_URL`, `HERMES_PROXY_SECRET`
- `PROOFGATE_SERVICE_SECRET`, `PROOFGATE_DATA_KEY`
- `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`, `VAPI_SQUAD_ID`, `VAPI_WEBHOOK_SECRET`

Optional names are `META_GRAPH_API_VERSION` and
`META_ACTION_REQUIRED_TEMPLATE`. A Worker version/hostname may be recorded as a
control-plane deployment receipt, but it becomes live acceptance evidence only after a
successful HTTPS smoke check. A quick tunnel to the AWS Hermes gateway is
development-only; external merchant onboarding requires a named tunnel or stable
custom origin.

The installed Hermes `v0.18.2` Cloud adapter validates Meta's raw-body HMAC but does
not consume `X-ProofGate-Proxy`. Before onboarding, put a Cloudflare Access
service-token policy or a reverse proxy that validates `HERMES_PROXY_SECRET` in front
of Hermes port `8090`. Merely setting the Worker secret and forwarding the header is
not origin access control.
