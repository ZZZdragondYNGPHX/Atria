# Worldbook Performance Foundation

## Task

- Task branch: `feat/worldbook-performance-foundation`
- Implementation baseline: `main@65321bb522febd369901127cd2b4b2c9883d4658`
- Final validated task head: `b5949b5a62b5907b0863bad0bcb4b904d409ad3f`
- Pull request: #8 — `feat: worldbook performance foundation`
- Squash merge / resulting main: `3ca80415386dff83017b608e23ee9475ee8e0128`
- Master plan: `docs/plans/worldbook-performance-master-plan.md`
- W-04/W-05 continuation baseline: `main@3ca80415386dff83017b608e23ee9475ee8e0128`
- W-04/W-05 final validated task head: `3dfe21f469389e85a96441b6e657daf9bde45f0c`
- W-04/W-05 pull request: #9 — `feat: worldbook W04-W05 selection foundation`
- W-04/W-05 squash merge / resulting main: `03d97d655370b31c2a27dd1235f917deadd6246e`

## Goal

Establish a measured foundation for long-chat / World Info work without replacing the existing SillyTavern-compatible World Info engine or creating a second writable gameplay-state system.

The merged scope now covers P-00/P-01 and W-00 through W-05. P-02 through P-05 remain follow-up work.

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

### W-04 incremental indexing and explicit selection

- Added `public/scripts/atri-world-info-selection.js` as a pure selection layer rather than creating a second World Info engine.
- Added a conservative incremental inverted index for static primary-key entries.
  - unchanged descriptors are reused;
  - changed/removed entries update only their affected index records;
  - regex, dynamic macro, vectorized, constant, state-activation, active sticky and otherwise unsafe shapes remain in the compatibility candidate set.
- Indexed candidates still pass through the existing `WorldInfoBuffer.matchKeys` checks. The index narrows candidates only; it never decides activation by itself.
- Index-query failure degrades to the complete candidate set with an explicit diagnostic reason.
- Added explicit required-entry dependencies supporting local UID and `Book#UID` references.
  - dependency closure is dependency-first;
  - missing, disabled, ineligible, cyclic and over-depth dependencies reject the complete bundle;
  - character filters, triggers and W-03 state/event eligibility remain enforced for dependencies.
- Added related-entry relevance hints without force-activating related material.
- Added explicit mutual-exclusion groups.
- Added budget tiers: `critical`, `scene`, `normal`, `optional`.
- Added full/compact bundle variants. Required bundles are atomic:
  - full bundle is selected when it fits;
  - otherwise the whole bundle may downgrade to compact content;
  - if compact still does not fit, the whole bundle is rejected;
  - no required bundle is partially injected.
- Added structured author controls for required/related references, mutual exclusion, budget tier and compact content.
- Added selection diagnostics including index update statistics, compatibility classification and per-loop degradation/candidate counts.
- Added synthetic 1k/10k cold-build, incremental-update and query coverage.
- No new default online/per-entry model call was introduced. Existing vectorized semantic recall remains the opt-in semantic path; a new semantic layer was not justified by the measured W-04 cut.

### W-05 typed compatibility and default cutover

- Chose runtime capability classification instead of rewriting old user data:
  - `atria_v1`: entries using W-04 Atria selection metadata;
  - `indexed_legacy`: old entries whose static keyword shape is safe for candidate indexing;
  - `compatibility`: entries that retain the established full scan path.
- Old entries without W-04 metadata retain the established probability/budget/activation path.
- Added Atria character-book extension fields:
  - `extensions.atria_required_entries`
  - `extensions.atria_related_entries`
  - `extensions.atria_mutual_exclusion_group`
  - `extensions.atria_budget_tier`
  - `extensions.atria_compact_content`
- Character-book import/export round-trips the new fields while preserving unknown top-level and extension fields.
- No storage-format migration, automatic user-data rewrite, duplicate state owner or deletion was added.
- The isolated worldinfo browser harness now self-bootstraps on a clean CI runner when a developer-local data seed is absent; personal seed data is no longer an acceptance-test prerequisite.

## Validation

Latest validated task head: `3dfe21f469389e85a96441b6e657daf9bde45f0c`.
Latest resulting main: `03d97d655370b31c2a27dd1235f917deadd6246e`.

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

W-04/W-05 continuation passed:

- Worldbook Performance Foundation #105
  - focused Jest regressions including dependency/mutex/degradation/atomic-budget coverage
  - synthetic 1k/10k candidate-index benchmark
  - isolated real-host Chromium smoke
  - worldinfo #25 real mock-model request acceptance proving a required dependency reaches the actual completion request
  - worldinfo #29 export/delete/re-import round-trip proving W-04 and unknown fields survive
- Atria PR Checks #352
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
  - `extensions.atria_required_entries`
  - `extensions.atria_related_entries`
  - `extensions.atria_mutual_exclusion_group`
  - `extensions.atria_budget_tier`
  - `extensions.atria_compact_content`
- W-05 performs no automatic migration rewrite; compatibility is selected at runtime and unknown fields are preserved.
- MVU / LoreState remain state owners; World Info reads snapshots only.

## Follow-up

W-04/W-05 are complete in PR #9 and merged to `main@03d97d655370b31c2a27dd1235f917deadd6246e`.

Remaining master-plan slices:

- P-02 through P-05 long-chat / storage / frontend performance work.

Future slices should start from the live `main` in new temporary task branches. W-04/W-05 should not be reopened as a compatibility migration unless a new measured requirement justifies it.
