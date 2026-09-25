# Native orchestration preset refresh

Date: 2026-09-25. Branch: `fix/native-orchestration-presets`.
Baseline: `df03dedbd46243bdf71e61861b494c7a30a20bd1`.
Implementation: `1a3e891230eb15b65af0772a1879f97cc77db8d7`.
User explicitly requested no push; all integration is local.

## Changes and contracts

The existing Workspace factory applies native prompt authoring before compiling
the four fixed Plans. Native preset revision is now 2. No new persistence or
routing authority is introduced; existing fixed-definition restoration upgrades
built-ins and preserves user-owned copies, exact Runtime Routes and bindings.

All roles now distinguish World/Journal authority, Knowledge/Package reference
material, historical memory, user intent and advisory plans. Game input envelopes
and command failures are handled explicitly. Agents cannot narrate new state
settlements into existence. Missing tools/data produce explicit gaps.

- Spec keeps its graph and adjacent-layer review contract, removes universal
  anti-data word/number bans, and preserves final `text` output.
- Loop uses bounded, targeted reads and `finalize({capsule_text})` guidance.
- Agenda retains its planner/worker/finalizer protocol, limits and roles; its
  source wording now uses Session/Knowledge/World instead of retired surfaces.
- Director keeps nine workers and its draft tools, with self-contained role
  prompts and no mandatory named skills. Dispatch is demand-driven; final prose
  uses `write_message` and `finalize({})`, respecting continuation append behavior.

No graph topology, tool permissions, route resolution or user data changes.
Single Agent factory also receives the native Spec guidance rules.

## Verification actually executed

37 passing tests across six targeted suites (latest successful executions):
native-orchestration-prompts (9), atri-agenda-defaults (6), workspace-presets (4),
llm-orchestrator-narrative (8), director/profile-shape (5), workspace-preset-help (5).
Changed production/test JavaScript ESLint and git diff whitespace checks passed.
Early new-test fixtures were corrected to use the exact Runtime Route schema
and normalized saved Plan identity; mode assertions were split for Jest lint.
No paid inference, browser visual QA, full repository suite, Android or Docker.
Prompt wording and runtime contracts are covered; model quality is not empirically evaluated.

## Additional built-in asset audit

User asked whether plugin-in and similar presets remain. No `plugin-in` asset or
reference was found. `public/presets/plugin-only.json` (Atri-plugin-only),
`agent-non-director.json` (Atri-agenda-agent), and `agent-director.json` remain.
They are static public files, not selected/imported by Native Workspace. Current
Runtime help opens Routes; tests verify all four modes avoid compatibility preset
imports. The default content manifest does not register these Atri assets.
Old import-button translations remain in zh-CN/zh-TW. No asset or translation was
removed in this task; no installed user libraries were inspected or modified.

Previous handoff and Regex scope work remain in `feat/native-regex-scopes.md`.
