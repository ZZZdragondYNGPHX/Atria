# Active checkpoint: N7 validated — N8 next

## Status

**N7 — Native Context Architecture is complete and validated. Do not redo N0–N7.**

- Working branch: `refactor/atria-native-content-session-architecture`
- N7 validated HEAD: `8fa25d1175603da905a45b9de7b8de5a8d4b776f`
- Workflow: **Native Content Session Dev Checks #121**
- Run: `35711043211`
- Result: **success**
- N0–N7 are frozen.
- `main` remains untouched.
- Continue on the same long-lived refactor branch; do not create a new branch.
- Formal plan: `refactor/atria-native-content-session-architecture.md`
- Detailed handoff: `handoff/atria-native-content-session-architecture.md`
- N8 startup prompt: `handoff/atria-native-session-n8-prompt.md`

## N7 final boundary

N7 established the bounded Native Context architecture without changing canonical Session authority:

- one `SessionContextCompiler` owns the model-input budget;
- structured `ContextProvider` / `ContextItem` / `ContextPlan` contracts;
- model context limit → response reserve → safety/framing margin → Hard Reserve → Minimum Guarantees → Elastic Pool;
- Runtime/System and tool-schema accounting participate in the same total budget;
- complete token-budgeted TurnGroups instead of fixed floor counts or partial-message trimming;
- generation-processed prompt text is used for raw token accounting while sourceRefs remain canonical Timeline identities;
- N6 KnowledgePlan is consumed as a stable-identity Knowledge lane, with mature World Info selection retained under the Context lane cap;
- current Native World / Game World / Event Journal state has authority above stale Knowledge/Memory evidence;
- source-backed Narrative Spine: Scene → Chapter → Arc → Campaign;
- Active Commitments with stable identity and explicit open/closed/superseded lifecycle;
- Derivation Gate + bounded Turn Distiller compatibility contract;
- Runtime/Orchestrator/Utility digest reuse before optional extra derivation;
- Native Memory cheap provenance ingest on normal turns and gated heavy extraction/consolidation;
- branch/revision/source provenance, derived coverage and lag diagnostics;
- ancestor-derived Narrative/Commitments remain reusable after fork while sibling branches stay isolated;
- stale asynchronous derived work degrades to `stale_revision` rather than poisoning Session runtime;
- exact raw Timeline drill-down by revision/range/stable messageId;
- Memory recall provenance can drill down to immutable raw Timeline text;
- Narrator / Actor / Agent target isolation;
- Economy / Balanced / Rich context policies without changing canonical data semantics;
- Utility/provider failure is non-blocking and diagnostic;
- canonical Timeline remains complete and immutable; Context is only a bounded derived projection.

## Checkpoint C validation

Exact HEAD `8fa25d1175603da905a45b9de7b8de5a8d4b776f` passed:

- N0 Native Contracts: success;
- N1 Storage + N3/N5 Core + N4 Projection: success;
- N2 Package Project Composition: success;
- N4 real-host Chromium Native Session acceptance: **4 passed**;
- N5 Runtime State & Revision Lifecycle: success;
- N6 Native Knowledge Runtime Integration: success;
- N7 Checkpoint C: **6 suites / 53 tests passed**;
- N7 source lint: success;
- full root lint: success;
- complete Node regression: **752 suites / 8777 tests passed**;
- frontend webpack build: success.

Checkpoint C is satisfied for bounded 100 / 1,000 / 10,000+ turn contexts, raw-history retrievability, exact provenance drill-down, derived-lag fallback, target isolation, source-backed Narrative hierarchy and graceful derived-work failure.

## Next action

Start **N8 — Save System & `.atriasave`**.

N8 owns Auto / Quick / Manual Save, revision-backed SavePoints, portable snapshot/full-session export/import, dependency closure, embedded Session-bound Knowledge snapshots, Narrative/Commitment/coverage persistence, optional AEAD protection and missing-dependency handling.

Do not start N9 Product UI Cutover or N10 Hard Cutover / Legacy Retirement early. Do not merge `main`.
