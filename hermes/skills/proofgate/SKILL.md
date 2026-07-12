---
name: proofgate
description: Use when creating, resuming, verifying, promoting, or guarding a ProofGate mission in this repository. Enforces typed operations, restricted delegation, evidence truthfulness, deterministic release authority, and provider approval boundaries.
version: 0.1.0
author: ProofGate
license: MIT
metadata:
  hermes:
    tags: [proofgate, evidence, verification, releases, guardian]
    related_skills: [evidence-gated-agent-systems, test-driven-development]
---

# ProofGate Mission Operations

## Overview

ProofGate turns an intake into an immutable, publicly verifiable transactional site. Hermes is the launch manager, not the release authority. Models may propose typed `SiteSpec` or allowlisted patch data; deterministic code validates, verifies, promotes, revokes, and rolls back.

The governing specification is `PROOFGATE_BUILD_BIBLE.md`. Read `AGENTS.md`, the active mission records, and `EVIDENCE.md` before acting. Never narrate a development probe into production evidence.

## When to Use

Use this skill to:

- Create or resume a ProofGate mission.
- Delegate a restricted ProofGate role.
- Propose or apply a typed SiteSpec patch.
- Trigger candidate verification or exact replay.
- Interpret an incident and request deterministic promotion.
- Dispatch Telegram text/audio and append the Hermes provider receipt.
- Operate guardian scheduling, revocation, or rollback.

Do not use it for unrelated website generation or arbitrary production-code editing.

## Authority Boundaries

| Role | Allowed | Forbidden |
|---|---|---|
| Launch Manager | Coordinate typed operations and provider adapters | Directly set passport color or production pointers |
| Brief Compiler | Emit structured brief | Deploy, message, verify, or promote |
| Site Builder | Propose a Zod-valid `SiteSpec` or allowlisted patch | Emit runtime page code or write evidence |
| Verifier | Read immutable public URL and append scoped observations | Receive mutation, deployment, payment, provider, or promotion credentials |
| Incident Analyst | Classify immutable failure evidence | Patch, deploy, message, or promote |
| Runtime Specialist | Propose one allowlisted SiteSpec patch | Change renderer/runtime code or release state |
| Release Authority | Deterministically evaluate authoritative facts | Use model judgment or UI state as proof |
| Guardian | Run safe due contracts and revoke/roll back by policy | Charge money or contact customers without consent |

Child agents never send customer messages, modify global Hermes memory, promote production, or receive general provider credentials.

## Mission Workflow

### 1. Create or resume

1. Read `EVIDENCE.md`, `docs/provider-readiness.md`, and the relevant append-only mission/version/contract/event records.
2. Resolve the active site, candidate version, immutable spec hash, contract, run, incident, and pending approval.
3. If any identifier is ambiguous, stop before mutation and request the missing typed identifier.

Completion: every operation is bound to exact `siteId`, `versionId`, `specHash`, `contractId`, and `runId` values.

### 2. Read and write through typed operations

- Validate every agent-produced SiteSpec with `packages/domain/src/site-spec.ts`.
- Reject unknown fields, scripts, unsafe URLs, unsupported handles, and non-allowlisted patch paths.
- Append events rather than rewriting history.
- Treat `submitted`, `dispatched`, `acknowledged`, `payment`, `fulfillment`, and `confirmation` as distinct predicates.
- Store product state in Convex; Hermes memory may contain only concise workflow facts.

Completion: no model output directly changes evidence, events, production pointers, or passport state.

### 3. Delegate restricted roles

Delegate with the smallest context and toolset. State:

- Objective and exact input artifact IDs.
- Allowed output schema and patch paths.
- Forbidden actions.
- Budget and maximum attempts.
- Evidence needed for completion.

The top-level manager performs all side effects through typed adapters. A role created after a failure records the causal incident and creation timestamp.

Completion: the child returns only its permitted artifact, and the manager validates it before use.

### 4. Trigger verification

- Give the verifier only the immutable public candidate URL, validated contract, non-secret fixture, and one-use evidence capability.
- Launch with an allowlisted environment. `apps/verifier-runner/src/capabilities.ts` defines forbidden credential classes.
- Run exact replay in a fresh browser context and preserve every attempt.
- Reject observations for a different hash, version, contract, run, fixture, or capability.

Completion: authoritative observations are appended for the exact immutable candidate and no forbidden credential entered the verifier process.

### 5. Interpret incidents and propose patches

1. Classify the first failing predicate from append-only evidence.
2. Reproduce once before opening an incident when policy requires confirmation.
3. Generate a role scoped to the failure rather than selecting a broad hardcoded role.
4. Propose only allowlisted SiteSpec operations.
5. Validate the patch, create an immutable version, and replay the exact failed contract.

Completion: the incident points to the immutable failed run and the patch cannot mutate renderer code, evidence, or release state.

### 6. Request deterministic promotion

A promotion request is not a promotion. Deterministic release code must prove:

- Candidate pointer matches the verified version and hash.
- Every blocking contract passed.
- Required authoritative external witness exists.
- Required confirmation predicate exists.
- No targeting incident remains open.
- Evidence came through the capability minted for this run.

Never expose or call an operation that assigns `green` directly. Passport state is a projection of facts.

Completion: either deterministic policy changes the pointer and appends a release event, or a precise blocking predicate is returned.

### 7. Send Telegram confirmation

- Send through `packages/hermes-io/src/telegram.ts`; do not read the bot token directly in product code.
- Use an explicit bound target, never an inferred home channel for customer evidence.
- Append the Hermes receipt containing platform, chat identity, and provider message ID.
- A send receipt proves dispatch only. It does not prove acknowledgment.
- Acknowledgment requires the bound external recipient to use the signed, expiring booking capability.
- Generated voice must be fresh for the run. Prerecorded audio is never live proof.

Completion: dispatch and acknowledgment are separate append-only events with exact correlation fields.

### 8. Operate guardian cron

Cron sessions start without chat context. Attach this skill and set the repository workdir. Each run:

1. Queries due production sites.
2. Enqueues only guardian-eligible safe contracts.
3. Replays once after an initial failure.
4. Opens an incident only for reproducible failure.
5. Applies deterministic revocation or rollback policy.
6. Sends an alert through the manager.
7. Records whether the trigger was scheduled or manual.

Never perform a real charge from guardian work.

Completion: every guardian effect has a schedule/run receipt and an append-only policy decision.

## Operator Approval Required

Require explicit operator approval before:

- Accepting provider legal terms.
- Creating billable or production provider resources.
- Sending the first message to a real external participant.
- Recording consent or contacting a customer.
- Performing a live payment.
- Promoting or rolling back production when policy marks human approval mandatory.
- Starting outbound Customer Witness calls.

Credentials and reversible development deployments do not become evidence merely because an operator approved them.

## Claims That Must Never Be Made

Never claim that:

- A mock, redirect, localhost page, temporary screenshot, or test provider event is production proof.
- A team member, builder, test account, or synthetic verifier is an external merchant or buyer.
- Form submission is dispatch, acknowledgment, payment, fulfillment, or confirmation.
- A Telegram send receipt is recipient acknowledgment.
- Test money is a live payment.
- Prerecorded audio is a fresh generated confirmation.
- Green means more than the predicates publicly listed for the exact version.

## Common Pitfalls

1. **Broadening after a blocker.** Continue only work that belongs to the blocked gate; do not replace the mandatory external oracle with feature breadth.
2. **Credential inheritance.** Start verifier processes from an environment allowlist rather than deleting known secrets.
3. **Token leakage.** Never log signed booking capabilities, provider tokens, raw customer identifiers, or consent payloads.
4. **Mutable proof.** Preserve failed attempts and immutable hashes even after a retry passes.
5. **Self-attestation.** Builder output and verifier output cannot share mutation or promotion authority.
6. **False acknowledgment.** Only a bound external participant action may append the acknowledged event.

## Verification Checklist

- [ ] Exact site/version/hash/contract/run binding is present.
- [ ] Agent output passed Zod validation.
- [ ] Verifier received no forbidden capability.
- [ ] Submitted, dispatched, and acknowledged remain distinct.
- [ ] External actor eligibility is recorded.
- [ ] Failures remain visible in the evidence ledger.
- [ ] Passport/release state was derived deterministically.
- [ ] Provider receipts contain real IDs and truthful environment labels.
- [ ] Any voice artifact is fresh and consent-compatible.
- [ ] Final claim matches the evidence category exactly.
