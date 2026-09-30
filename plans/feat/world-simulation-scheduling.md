# World Simulation Scheduling — bounded Core support

- Task ID: feat/world-simulation-scheduling
- Primary Workspace: main (short-lived product branch)
- Consumer: package/original-occult-western-fantasy-game, P3 only
- Status: completed and integrated; evidence in records/feat/world-simulation-scheduling.md

## Gap / scope

Package G2 evidence is in the Package Record and its executable diagnostic. Existing authority-transaction@1, Lifecycle, Task outbox, Session CAS and Information publication remain authoritative. This is not a replacement scheduler/state store and does not reopen P0 or G1.

Add a narrowly bounded, declarative World Simulation orchestration contract. No arbitrary code, selectors, unbounded loops, model-chosen writes, fabricated player messages, hidden player context or raised execution limits. Preserve all old Package behavior when the new contract is absent. New capability stays unsupported until implementation and integration tests pass.

## Required semantics

1. Static domain/record/field grants; reuse the existing Formula AST, type inference, typed templates and exact computed-value schema checks. Evaluate private institutional input against a Ready anchored candidate. No whole-record/world/history export.
2. Due time, enabled predicate, coarse relevance and stable priority are declared. Advance by the next meaningful due event, deterministic and conditional state first. Cold state progresses without model calls. Bounded work fails closed; never silently skip obligations.
3. Reuse declarative Authority Transactions for institutional changes, with an explicit non-player origin that is not exposed to the player resolver/frontend. System invocation identity binds the actual Session/branch/revision and scheduled occurrence; it cannot reuse a fictitious user turn.
4. Reuse Lifecycle outbox and existing Task sink to record bounded Agenda intent. Admission is separate from provider scheduling. Foreground ordinary actions default to zero deliberations; catch-up uses an explicit small budget. One admitted deliberation per batch is sufficient for the first supported profile, with deterministic priority/identifier selection; do not merge institution perspectives.
5. Accepted proposals use existing revision/CAS and schema checks plus current declared state eligibility. Stale work fails closed; no immediate recursive model retry. Pending requests can be superseded before acceptance, not committed Events. Provider failure creates no speculative world consequence.
6. Reuse existing domain, World Journal, Task and Lifecycle history. A derived safe publication occurs before Session publication. No Outcome/Resolution domain, parallel event history or client-owned authority.
7. Multi-day catch-up must stop/fail at a declared bounded continuation boundary rather than exceed authority ceilings. Real save-container restoration preserves committed outcomes; no durable uncommitted selection journal is assumed.

## Implementation / verification order

- Extract/reuse bounded expression validation without behavioral changes; regression-test existing Authority and Lifecycle contracts.
- Add gated simulation declarations and exact cross-resource closure tests, including forbidden fields/roots, typed computed values, static targets and capability requirement.
- Add pure bounded deterministic preparation/system invocation using shared authority budgets and existing state; exercise due ordering, no-source-mutation, reaction/work limits and stale fail-closed behavior.
- Integrate existing Session publication and Task dispatch; verify zero provider-failure mutation and accepted invocation idempotency.
- Integrate product branch only after targeted regression/lint and actual installed synthetic simulation/restore evidence. Then resume Package P3 on latest actual main, preserve long-lived package, update same Package Record/HANDOFF and stop at P3 exit.

Any adjustment must preserve the approved gameplay semantics. This plan does not authorize P4 content, P8 UI, broader Core redesign or changing hard limits.
