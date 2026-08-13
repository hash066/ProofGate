# Convex development and production foundation

Status on 2026-08-08: the authenticated account deployed development
`earnest-mandrill-823` (`https://earnest-mandrill-823.convex.cloud`) and production
`tame-corgi-404` (`https://tame-corgi-404.convex.cloud`). Both pushes completed with
typechecking, and each deployment has its own `PROOFGATE_SERVICE_SECRET`. Secret values
remain outside git. The commands below are retained as the reproducible setup procedure,
not as work still required for these two deployments.

ProofGate requires separate account resources for development and production. The
following command shapes were validated against the installed Convex CLI. Replace
`TEAM_SLUG` only with the team slug shown by the authenticated account; do not invent
it.

```powershell
# Project creation invokes the account-owner authentication/team flow when needed.
npx convex project create proofgate-whatsapp-dev --team TEAM_SLUG
npx convex project create proofgate-whatsapp-prod --team TEAM_SLUG

# Create and select the development deployment, then push the schema/functions once.
npx convex deployment create TEAM_SLUG:proofgate-whatsapp-dev:dev/proofgate `
  --type dev --default --select --expiration none
npx convex dev --once --typecheck enable

# Create the default production deployment and select its project for the production push.
npx convex deployment create TEAM_SLUG:proofgate-whatsapp-prod:production `
  --type prod --default --select --expiration none
npx convex deploy --typecheck enable --message "ProofGate WhatsApp bakery foundation"
```

Before either deployment can serve administrative actions, set a separately generated
`PROOFGATE_SERVICE_SECRET` on that deployment:

```powershell
$proofgateConvexSecret = Read-Host "PROOFGATE_SERVICE_SECRET" -MaskInput
npx convex env set PROOFGATE_SERVICE_SECRET $proofgateConvexSecret
Remove-Variable proofgateConvexSecret
```

The development and production values must not be reused. Preserve the generated
deployment names/URLs outside git. Set the production URL on the Worker as
`CONVEX_URL`; do not commit it as a fake or guessed value. After each push, inspect the
Convex deployment and append the real project/deployment receipt to `EVIDENCE.md`.

Authentication and team selection are intentionally account-owner actions. If any CLI
flow provisions an unintended starter project, preserve it and ask the owner whether it
may be deleted; do not delete it automatically.
