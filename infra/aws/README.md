# AWS foundation

`cloudformation.yaml` creates the approved `t3.small` Ubuntu host with an encrypted
gp3 root volume, an outbound-only security group, Polly and Systems Manager access,
and no SSH ingress. Consented call recordings and merchant media use different private,
encrypted, versioned S3 buckets and different IAM policy statements. Recordings expire
after 30 days. Unselected uploads expire after 30 days, generated private renders after
90 days, and explicitly published immutable media has no automatic expiration.

The stack also creates an operator SNS topic and CloudWatch alarms for relay Lambda
errors, delayed relay messages, dead-letter messages, EC2 instance failures, and EC2
system failures. A two-minute system failure triggers EC2 action-based recovery on new
hardware while retaining the instance identity and EBS state. This does not replace
application-level health monitoring or a multi-instance failover design.

## Preflight

The account owner must authenticate first. Do not infer authentication from an AWS account existing in a browser.

```sh
aws sts get-caller-identity --region ap-south-1
aws cloudformation validate-template --template-body file://infra/aws/cloudformation.yaml --region ap-south-1
```

Static source tests are not an AWS validation or deployment receipt. Run the authenticated
validation above before changing the live stack.

Deploy only after the account owner accepts AWS terms and selects the account/region:

```powershell
npm run aws:deploy -- -RepositoryCommit FULL_PUSHED_40_CHARACTER_SHA -OperatorAlertEmail operator@example.com
```

That command fails closed unless AWS identity and CloudFormation validation succeed. It
creates the stack, waits for the instance to register with Systems Manager, checks out
the exact pushed ProofGate commit, runs `npm ci`, installs the repository Hermes skill,
and enables the isolated gateway, typed bridge, guardians, relay, authenticated origin,
and named-tunnel services. It does not accept or store any customer credential. AWS sends
a confirmation email for the SNS subscription; alerts will not reach that address until
the operator confirms it.

After deployment, record the returned `MerchantMediaBucket`, `RecordingsBucket`, and
`OperationsAlertTopicArn`. Verify all five alarms have actions enabled and remain `OK`,
send one controlled SNS test notification, and confirm its delivery. Do not manufacture a
DLQ event in production merely to test alerting.

The host pins the signed Hermes `v2026.7.7.2` release (`v0.18.2`) at commit `9de9c25f620ff7f1ce0fd5457d596052d5159596`. Do not use the old `fb402106` pin: inspection shows that commit contains `v0.20.0`.

After deployment, wait for the stack and SSM registration, then connect without opening an inbound port:

```sh
aws ssm start-session --target INSTANCE_ID --region ap-south-1
```

Place the reviewed ProofGate commit at `/opt/proofgate/ProofGate`; do not deploy an uncommitted workstation tree. Then install the repository skill for the service user and verify both installations:

```sh
sudo -u proofgate -H mkdir -p /home/proofgate/.hermes/skills
sudo -u proofgate -H ln -s /opt/proofgate/ProofGate/hermes/skills/proofgate /home/proofgate/.hermes/skills/proofgate
cat /opt/proofgate/HERMES_PIN
sudo -u proofgate -H hermes --version
sudo -u proofgate -H hermes skills list
```

Configure the official Meta adapter with the installed interactive command. There is no `setup` subcommand:

```sh
sudo -u proofgate -H hermes whatsapp-cloud
```

Keep `WHATSAPP_CLOUD_*` secrets in `/home/proofgate/.hermes/.env`, never in user data or Git. Meta's callback remains the Worker `/whatsapp/webhook`: the Worker verifies signatures and intercepts signed `pg:` decisions before forwarding ordinary raw bodies. Point the Worker's `HERMES_ORIGIN_URL` at the durable named-tunnel hostname; its service targets the authenticated origin on port `8080`.

The tunnel must route to `http://127.0.0.1:8080`, not directly to Hermes. The
`proofgate-hermes-origin` service checks the Worker's `X-ProofGate-Proxy` secret using a
constant-time comparison, preserves the exact Meta body and signature, and only then
forwards to Hermes on loopback `127.0.0.1:8090`. Store the matching secret in
`/etc/proofgate/origin.env` with mode `0640`; store the named-tunnel connector token in
`/etc/proofgate/cloudflared-token` with mode `0640`. Both are ProofGate operator
credentials, never merchant credentials.

Only after the Worker, named tunnel, allowlist, signature checks, and local health probe pass, install the service without starting it prematurely, then start it explicitly:

```sh
sudo hermes gateway install --system --run-as-user proofgate --no-start-now --start-on-login
sudo hermes gateway start
sudo -u proofgate -H hermes gateway status
```

Use a quick tunnel only for foundation testing. Before an external merchant is enrolled, configure a named Cloudflare Tunnel/custom origin and set `HERMES_ORIGIN_URL` on the Worker.

The installer includes `proofgate-cloudflared-quick.service` but deliberately does not
enable it. Start it manually only for foundation tests; its random `trycloudflare.com`
URL is temporary and must be replaced by the named tunnel before merchant onboarding.
