# Active checkpoint: N6 validated — N7 next

## Status

**N6 — Native Knowledge Runtime Integration is complete and validated. Do not redo N0–N6.**

- Working branch: `refactor/atria-native-content-session-architecture`
- N6 validated HEAD: `b1043b2e0158cf4d5ade4d057570efe2a7af8ac1`
- Workflow: **Native Content Session Dev Checks #118**
- Run: `35703649183`
- Result: **success**
- N0–N6 are frozen.
- `main` remains untouched.
- Continue on the same long-lived refactor branch; do not create a new branch.
- Formal plan: `refactor/atria-native-content-session-architecture.md`
- Detailed handoff: `handoff/atria-native-content-session-architecture.md`
- N7 startup prompt: `handoff/atria-native-session-n7-prompt.md`

## N6 final boundary

N6 established the Native Knowledge runtime layer above the exact revision-pinned binding set created in N3:

- deterministic `KnowledgeCompiler` / target-aware `KnowledgePlan`;
- authority separate from priority;
- explicit authority classes for Runtime mechanics, current Session State, committed Event Journal, Knowledge override, Package canon, Library augment, Session augment and Memory/history evidence;
- Package / Library / Session exact source resolution without following mutable Library current pointers;
- Narrator / Actor / Agent / User target and visibility filtering;
- current committed `atri_*` SessionState exposed as read-only Knowledge state providers;
- `atri_game_world` current state and committed Event Journal precedence;
- stale Knowledge with deterministically false current-state applicability is rejected;
- explicit Knowledge override outranks ordinary Knowledge but still cannot bypass current-state applicability;
- Library augment cannot displace higher-authority Package canon within explicit exclusive groups;
- Memory/history state claims conflicting with committed current state are rejected as stale evidence;
- required dependencies, related entries and exclusive groups preserve stable Native identities;
- Native Knowledge candidates enter the existing World Info keyword/regex/probability/recursion/sticky/cooldown/delay machinery instead of replacing it;
- stable Knowledge identity survives through World Info prompt provenance even when rendered bodies are identical;
- Native World Info state-event baselines use revision/branch/message identity and SessionState instead of floor/swipe authority;
- generation-local state-event baselines are Draft-local and commit atomically with an accepted Assistant Timeline append; Stop/abort discards them;
- exact Library Knowledge revision pinning is proven: Library N → N+1 does not move an existing Session until explicit Knowledge update creates a new SessionRevision.

## Validation

Exact HEAD `b1043b2e0158cf4d5ade4d057570efe2a7af8ac1` passed:

- N0 Native Contracts: success;
- N1 Storage + N3/N5 Core + N4 Projection: success;
- N2 Package Project Composition: success;
- N4 real-host Chromium Native Session acceptance: success;
- N5 Runtime State & Revision Lifecycle: success;
- N6 Checkpoint K / Knowledge + World Info integration: **7 suites / 99 tests passed**;
- N6 source lint: success;
- full root lint: success;
- complete Node regression: **749 suites / 8750 tests passed**;
- frontend webpack build: success.

## Next action

Start **N7 — Native Context Architecture**.

N7 owns the bounded derived model context: ContextProvider/ContextItem, SessionContextCompiler, total token-budget authority, ContextPlan diagnostics, complete TurnGroup recent history, Narrative Spine, Active Commitments, Derivation Gate, derived coverage/lag and raw Timeline drill-down.

Do not start N8 Save System / `.atriasave`, N9 Product UI Cutover or N10 Hard Cutover / Legacy Retirement early. Do not merge `main`.
