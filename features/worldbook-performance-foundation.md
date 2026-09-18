# Worldbook Performance Foundation

## Task

- Task branch: `feat/worldbook-performance-foundation`
- Implementation baseline: `main@65321bb522febd369901127cd2b4b2c9883d4658`
- Final validated task head: `b5949b5a62b5907b0863bad0bcb4b904d409ad3f`
- Pull request: #8 — `feat: worldbook performance foundation`
- Squash merge / resulting main: `3ca80415386dff83017b608e23ee9475ee8e0128`
- Master plan: `docs/plans/worldbook-performance-master-plan.md`

## Goal

Establish a measured foundation for long-chat / World Info work without replacing the existing SillyTavern-compatible World Info engine or creating a second writable gameplay-state system.

The merged scope covers P-00/P-01 and W-00 through W-03. W-04/W-05 and P-02 through P-05 remain follow-up work.

## Implementation

### P-00 / W-00 verification foundation

- Added focused deterministic World Info regressions.
- Added a synthetic offline performance baseline.
- Added an isolated real-host Chromium smoke using a temporary data root and no provider credentials.
- Kept the baseline separate from external model latency and user data.

### P-01 bounded chat snapshot lifecycle

- Chat write snapshots now use a bounded working set.
- Active / queued writes retain the snapshots they need.
- Settled writes release old snapshots.
- Clone isolation and exceptional release behavior are covered by regression tests.

### W-01 identity and provenance

- World Info selection keeps occurrence identity through rendering and final prompt assembly.
- Orchestrator filtering no longer relies on body-string lookup.
- Repeated identical content and regex-rewritten content retain correct source attribution.
- Request-boundary attribution records source identities without copying private body text into diagnostic receipts.

### W-02 pure evaluation and explicit commit

- World Info scan/evaluation no longer commits timed state or emits `WORLD_INFO_ACTIVATED`.
- Accepted evaluations are committed explicitly through `commitWorldInfoEvaluation()`.
- `worldInfoEvaluationId` provides idempotency even across cloned/retried evaluation objects.
- Force-activation revisions are consumed only by the accepted evaluation.
- Stale chat scope and stale provider-state fingerprints are rejected.
- The explicit commit API is exposed through Atria context integration.

### W-03a native state conditions

- Added bounded, restricted scalar conditions with operators `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, and `contains`.
- Conditions use three-valued `true / false / unknown` logic.
- Missing providers, missing fields, provider initialization/error, malformed paths, and incompatible values fail closed as `unknown`.
- MVU / LoreState integration is read-only; World Info does not write provider state.
- Added structured author UI and character-book extension-field round-trip.

### W-03b state transition events

- Added exact scalar transition events comparing the previous committed provider baseline with the current read-only snapshot.
- No baseline, unknown previous value, or unknown current value yields `unknown`; no transition is invented.
- Evaluation does not advance the baseline.
- Accepted commit advances baseline through `atri_world_info_events` FloorState.
- Retry/regeneration on the same floor/swipe can replay the committed transition.
- Swipe and branch semantics are covered by FloorState rollback/inheritance regressions.
- Added structured author UI and character-book extension-field round-trip.

### W-03c provider-owned scene persistence

- Added optional `stateActivation` / `extensions.atria_state_activation`.
- Default is `false`, so existing keyword/constant behavior is unchanged.
- When explicitly enabled, a non-empty state-condition set that evaluates `true` may activate the entry without a repeated keyword mention.
- The provider remains the source of truth: repeated generations keep the scene entry active only while the committed provider state still matches; a false/unknown result exits immediately.
- No parallel scene database or writable World Info state source was introduced.
- Added author toggle, documentation, focused unit coverage, card export support, and real-host Chromium verification.

## Validation

Latest validated task head: `b5949b5a62b5907b0863bad0bcb4b904d409ad3f`.

Passed:

- Worldbook Performance Foundation #83
  - focused Jest regressions
  - synthetic offline benchmark capture
  - isolated real-host Chromium smoke
- Workspace UI #144
- Atria PR Checks #330
  - Atria Migration Guard
  - ESLint
  - complete Node unit suite

The W-03c Chromium smoke specifically verified:

1. a state-only scene entry activates at `scene.place = clocktower` without a keyword;
2. repeated generation at the same committed state keeps it active;
3. changing the provider state to `castle` removes the scene entry.

Android JVM tests and Android / Docker builds were intentionally not run for this task, matching the task constraints and current repository validation policy.

## Compatibility and data impact

- No user-data deletion.
- No storage-format migration.
- No default external model call was added.
- Existing entries keep their prior activation behavior because `stateActivation` defaults to `false`.
- New Atria fields are additive:
  - `extensions.atria_state_conditions`
  - `extensions.atria_state_condition_logic`
  - `extensions.atria_state_activation`
  - `extensions.atria_state_events`
  - `extensions.atria_state_event_logic`
- MVU / LoreState remain state owners; World Info reads snapshots only.

## Follow-up

Not implemented in PR #8:

- W-04 indexing, explicit dependencies, budget/selection variants, optional semantic recall;
- W-05 migration and default-switch work;
- P-02 through P-05 performance slices.

Those should start from the live `main` in new task branches rather than extending the completed foundation branch.
