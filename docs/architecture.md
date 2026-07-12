# Architecture

> Read the complete architecture, trust model, workflow pipelines, state machine, route design and truthful implementation map in [SYSTEM_ARCHITECTURE.md](SYSTEM_ARCHITECTURE.md).

Authoritative spec: [PROOFGATE_BUILD_BIBLE.md](../PROOFGATE_BUILD_BIBLE.md) §5 (lifecycle/state machine), §6 (hard architecture decisions), §7 (stack/repository), §8 (Hermes integration), §9 (domain model), §10 (capability separation & release authority), §11 (external event truth), §12 (Convex data model), §13 (agent organisation).

This file is filled DURING the build with the as-built record:

- [ ] Hermes capability matrix (bible §0 rule 1 + §8: what actually exists in this install — gateway, delegation, cron, browser, memory APIs)
- [ ] What the Hermes adapter/skill boundary wraps, and why each call
- [ ] Deviations from the bible (each with reason + what replaced it)
- [ ] Deploy pipeline as-built (canary → promote), with real URLs
- [ ] External event path as-built (Dodo/Telegram → verification → promotion → passport)
