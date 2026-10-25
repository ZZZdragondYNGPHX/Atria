# World Simulation Scheduling — bounded Core support

> 执行规则入口：[Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。本文件不另设验证或复审门槛。

- Task ID: feat/world-simulation-scheduling
- Primary Workspace: main (short-lived product branch)
- Consumer: package/original-occult-western-fantasy-game, P3 only
- Status: completed and integrated; evidence in records/feat/world-simulation-scheduling.md

## Gap / scope

Package G2 evidence is in the Package Record and its executable diagnostic. Existing authority-transaction@1, Lifecycle, Task outbox, Session CAS and Information publication remain authoritative. This is not a replacement scheduler/state store and does not reopen P0 or G1.

Add a narrowly bounded, declarative World Simulation orchestration contract. No arbitrary code, selectors, unbounded loops, model-chosen writes, fabricated player messages, hidden player context or raised execution limits. Preserve all old Package behavior when the new contract is absent. New capability stays unsupported until implementation and integration tests pass.

## Required semantics

1. Evaluate private institutional input against a Ready anchored candidate. No whole-record/world/history export.
2. Due time, enabled predicate, coarse relevance and stable priority are declared. Advance by the next meaningful due event, deterministic and conditional state first. Cold state progresses without model calls. Bounded work fails closed; never silently skip obligations.
3. Reuse declarative Authority Transactions for institutional changes, with an explicit non-player origin that is not exposed to the player resolver/frontend. System invocation identity binds the actual Session/branch/revision and scheduled occurrence; it cannot reuse a fictitious user turn.
4. Reuse Lifecycle outbox and existing Task sink to record bounded Agenda intent. Admission is separate from provider scheduling. Foreground ordinary actions default to zero deliberations; catch-up uses an explicit small budget. One admitted deliberation per batch is sufficient for the first supported profile, with deterministic priority/identifier selection; do not merge institution perspectives.
5. Stale work fails closed; no immediate recursive model retry. Provider failure creates no speculative world consequence.
6. Reuse existing domain, World Journal, Task and Lifecycle history. A derived safe publication occurs before Session publication. No Outcome/Resolution domain, parallel event history or client-owned authority.
7. Multi-day catch-up must stop/fail at a declared bounded continuation boundary rather than exceed authority ceilings. Real save-container restoration preserves committed outcomes; no durable uncommitted selection journal is assumed.
