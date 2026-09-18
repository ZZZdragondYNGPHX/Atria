# Atria Namespace Migration Plan

## 0. Task identity

- Repository: `ZZZdragondYNGPHX/Atria`
- Branch: `refactor/atria-namespace-migration`
- Baseline: `main@06fe61ac344f9240141489608b73b4072a3b6b99`
- Product model: Atria remains a SillyTavern-based modified product.
- Migration policy: **hard cutover**. No Luker backward-compatibility layer is required.

## 1. Goal

Remove Luker-era product identity, code namespaces, runtime protocol names, persistence namespaces, build/tooling names, documentation and test naming from the active Atria codebase.

The finished Atria `main` should use Atria/atri naming for Atria-owned functionality while retaining genuine SillyTavern upstream names where they belong.

This is not a cosmetic rename. It is a code-level namespace migration.

## 2. Hard constraints

1. **Do not preserve Luker compatibility.**
   - No aliases such as `runLukerDispatch -> runAtriaDispatch`.
   - No dual-read of `luker_generation` and `atria_generation`.
   - No fallback from `x-atria-*` to `x-luker-*`.
   - No dual registration of `luker_orch_*` and `atri_orch_*`.
   - No copy/migrate of old Luker IndexedDB, local state or floor-state namespaces.

2. **Old Luker runtime data may be discarded.**
   - Old IndexedDB databases.
   - Old local/session storage keys.
   - Old FloorState / chat-state namespaces.
   - Old orchestration exported format identifiers.
   - Old runtime cache/checkpoint namespaces.
   - Old generated/diagnostic filenames.
   - Old Termux state/toolbox paths where renaming is practical.

3. **Do not rename genuine SillyTavern upstream identifiers merely for branding.**
   Atria is still based on SillyTavern. Preserve upstream-owned names unless Atria already owns/overrides that surface.

4. **Do not perform blind global replacement.**
   Rename by subsystem, update imports/callers/tests together, and validate after every phase.

5. **No version bump unless required by an existing release mechanism.**

6. **Do not modify the long-lived `luker` reference branch.**
   This task removes Luker from the active Atria product line. The historical reference branch is repository metadata/reference, not runtime compatibility.

## 3. Completion definition

The migration is complete only when all of the following are true:

- active Atria source paths no longer use `luker` names for Atria-owned modules;
- user-facing Atria UI/docs/logging contain no stale Luker product branding;
- Atria-owned runtime APIs/protocols use Atria/atri names;
- Atria-owned persistence namespaces use Atria/atri names;
- Termux tooling points only to the Atria repository and Atria branch layout;
- tests/fixtures are renamed and updated;
- AI/developer documentation describes Atria only;
- lint and unit tests pass;
- Android JVM tests pass;
- relevant backend/frontend tests pass;
- repository-wide residual scan is reviewed and every remaining `luker|Luker|LUKER` occurrence is either removed or explicitly proven to be historical/reference-only and outside active product code.

Preferred final invariant for active code:

```bash
git grep -n -I -E 'Luker|luker|LUKER' --   ':!docs/**' ':!.git/**'
```

should return **zero active-code hits**.

For docs, any remaining mention must be intentionally historical. Product documentation should otherwise be Atria.

## 4. Known current residuals

At planning time, current `main` still contains more than one hundred paths with Luker naming. Important examples include:

### Backend / dispatch

- `src/luker-dispatch/`
- `src/endpoints/backends/luker-generation.js`
- `runLukerDispatch(...)`
- `request.body.luker_generation`
- `x-luker-request-id`
- `x-luker-generation-id`
- `x-luker-server-persisted`
- config keys such as `luker.generationAckGraceMs`

### Frontend / public API

- `public/scripts/lukerContext.js`
- `public/scripts/luker-keep-alive.js`
- `public/scripts/luker-download.js`
- `public/scripts/luker-android-debug-trail.js`
- `public/scripts/extensions/luker-tabs.js`
- `public/css/luker-studio.css`
- `public/css/luker-tabs.css`
- `public/css/luker-manage-bound-presets.css`
- global references such as `Luker.getContext()`
- DOM IDs/classes/data attributes prefixed with `luker_` / `luker-`

### Orchestrator / tools / portable formats

Examples currently include:

- `luker_orch_planner_step`
- `luker_orch_submit_result`
- `luker_orch_review_*`
- `luker_orch_*_custom_tool`
- `luker_orchestrator_profile_v1/v2/v3/v4`
- `luker_orchestrator_state`
- `luker_orchestrator_anchor_*`
- `luker_orchestrator_anchors`
- `luker_orch_loop_notes`
- selector/DOM IDs such as `luker_orch_execution_mode`

### Memory / shared runtime/tooling

Search for Atria-owned tool and state identifiers using Luker prefixes, including:

- `luker_memory_*`
- `luker_mg_*`
- `luker_ctx_*`
- `luker_docs_*`
- `luker_web_search`
- `luker_web_visit`
- `luker_search_agent_*`
- symbols such as `Symbol.for('luker_...')`

### Persistence

Known example:

- IndexedDB: `Luker_AgentRuntime_<scope>`

Also audit:

- localStorage/sessionStorage keys;
- IndexedDB database/store names;
- FloorState/chat-state namespaces;
- saved settings object keys;
- export/import format tags;
- cache keys;
- backup names;
- filenames such as `luker-storage.sqlite`;
- diagnostic/preferences names;
- any user data folder named `luker-*`.

No migration of old values is required. New Atria namespaces may start clean.

### Termux

Known active residuals include:

- `scripts/termux/luker.sh`
- `scripts/termux/luker_toolbox.sh`
- `scripts/termux/luker_toolbox.runtime.sh.gz`
- `scripts/termux/dist/luker_toolbox_*`
- `LUKER_TERMUX_PORT`
- `LUKER_TOOLBOX_RUNTIME_URL`
- URLs pointing to `ZZZdragondYNGPHX/Luker/custom-release`

These must be changed to Atria equivalents and must point at `ZZZdragondYNGPHX/Atria`.

### Tests

Examples:

- `tests/luker-dispatch/`
- `tests/luker-generation.test.js`
- `tests/luker-generation-task-store.test.js`
- `tests/luker-android-debug-trail.test.js`

Rename tests together with source modules and imports.

### Documentation

Examples:

- `docs/guide/what-is-luker.md`
- `docs/zh-CN/guide/what-is-luker.md`
- `docs/zh-TW/guide/what-is-luker.md`

Product docs should be renamed/reworked as Atria docs.

## 5. Target naming

Use these defaults unless existing Atria conventions clearly require another form.

### Product / JS public surface

- `Luker` -> `Atria`
- `lukerContext` -> `atriaContext`

### Internal Atria-owned modules

Prefer concise `atri_*` for protocol/tool/state namespaces.

Examples:

- `luker_generation` -> `atri_generation`
- `luker_orch_*` -> `atri_orch_*`
- `luker_memory_*` -> `atri_memory_*`
- `luker_mg_*` -> `atri_mg_*`
- `luker_ctx_*` -> `atri_ctx_*`
- `luker_docs_*` -> `atri_docs_*`
- `luker_web_*` -> `atri_web_*`
- `luker_search_agent_*` -> `atri_search_agent_*`

### Backend files/functions

- `src/luker-dispatch/` -> `src/atria-dispatch/`
- `luker-generation.js` -> `atria-generation.js`
- `runLukerDispatch` -> `runAtriaDispatch`

### HTTP

- `x-luker-request-id` -> `x-atria-request-id`
- `x-luker-generation-id` -> `x-atria-generation-id`
- `x-luker-server-persisted` -> `x-atria-server-persisted`

### Config

Atria-owned top-level config prefix:

- `luker.*` -> `atria.*`

Do not keep the old config prefix.

### Persistent/runtime namespaces

- `Luker_AgentRuntime_*` -> `Atria_AgentRuntime_*`
- other Atria-owned persistent namespaces: `luker_*` -> `atri_*` or `atria_*` based on their existing style.

### CSS/DOM

Prefer `atria-` / `atria_` consistently:

- `.luker-studio` -> `.atria-studio`
- `.luker-tabs` -> `.atria-tabs`
- `data-luker-*` -> `data-atria-*`
- `#luker_*` -> `#atria_*`

### Termux

- scripts/files: `luker*` -> `atria*`
- env: `LUKER_*` -> `ATRIA_*`
- state directories: `luker-*` -> `atria-*`
- URLs: point to `ZZZdragondYNGPHX/Atria/main` or the appropriate Atria artifact source.

## 6. Implementation phases

### Phase 1 — inventory and ownership map

Before renaming:

1. obtain the live branch HEAD;
2. build a complete residual inventory:
   - path names;
   - source text;
   - JSON/config;
   - HTML/CSS/DOM IDs;
   - tests/fixtures;
   - scripts/binaries that can be regenerated;
3. classify each hit as:
   - product branding;
   - module/file identifier;
   - runtime API/protocol;
   - persistence/data namespace;
   - test/fixture;
   - docs;
   - historical reference;
4. identify all imports and call chains for `src/luker-dispatch` and `luker-generation.js`.

Deliverable: a short inventory table in the implementation commit/PR description. Do not create a second planning subsystem.

### Phase 2 — backend dispatch + generation protocol

Rename backend-owned paths/functions/protocol in one coherent pass:

- directory `src/luker-dispatch` -> `src/atria-dispatch`;
- generation backend file;
- imports;
- function/class/constant names;
- request body field `luker_generation` -> `atri_generation`;
- response/trailer object fields where Atria-owned;
- HTTP headers `x-luker-*` -> `x-atria-*`;
- config prefix `luker.*` -> `atria.*`;
- server logs/debug labels.

Update all backend and frontend callers in the same phase.

Run targeted dispatch/generation tests before continuing.

### Phase 3 — frontend public API and shared helpers

Rename:

- `Luker.getContext()` -> `Atria.getContext()`;
- `lukerContext` -> `atriaContext`;
- helper files;
- keep-alive/download/debug-trail names;
- Android JS bridge references if still Atria-owned and named Luker;
- logs and UI strings;
- CSS/DOM/data attributes.

Do not introduce compatibility globals.

### Phase 4 — orchestrator + agent runtime namespaces

Perform an atomic namespace cutover for:

- tool names;
- control tool names;
- custom-tool authoring tools;
- exported profile format identifiers;
- DOM IDs/selectors;
- event/symbol names;
- FloorState/chat-state namespaces;
- notes/state anchors;
- runtime metadata keys.

Update built-in prompts and presets in the same change so agents never receive stale `luker_*` tool instructions.

Because old profiles are explicitly disposable, no profile upgrader is needed.

### Phase 5 — memory/search/context/docs tool namespaces

Rename Atria-owned tool schemas and registrations:

- memory tools;
- memory-graph tools;
- context discovery tools;
- docs discovery tools;
- web/search tools;
- any iteration-library names.

Update:

- tool registries;
- schemas;
- prompts;
- validators;
- tests;
- fixtures;
- docs.

Do not register legacy tool aliases.

### Phase 6 — persistence hard cutover

Audit all persistence locations and rename them to Atria.

Expected behavior:

- old Luker databases/keys are ignored;
- Atria creates fresh stores/namespaces;
- no migration;
- no fallback;
- no copy-forward.

Pay special attention to:

- IndexedDB;
- FloorState;
- chat metadata;
- localStorage;
- sessionStorage;
- cache/checkpoint names;
- saved preset/profile format tags;
- SQLite/default storage filenames;
- diagnostics/preferences files.

Add tests that verify new Atria names are used and old names are not referenced.

### Phase 7 — Termux/toolbox

Rewrite the Termux delivery path as Atria:

- rename scripts;
- rename environment variables;
- rename state/temp paths;
- update runtime URLs;
- regenerate any compressed/runtime/distribution assets from the renamed source;
- ensure no URL points to the Luker repository;
- update documentation.

Do not keep old launcher shims.

### Phase 8 — tests/docs/filesystem cleanup

Rename remaining:

- tests;
- fixtures;
- docs;
- CSS/JS filenames;
- internal comments;
- logs;
- README references.

Delete obsolete Luker-only generated/distribution artifacts rather than retaining duplicate copies.

### Phase 9 — final residual gate

Add or extend CI with an Atria namespace guard.

The guard should fail when active product code introduces new Luker naming.

Suggested approach:

```bash
if git grep -n -I -E 'Luker|luker|LUKER' --   ':!docs/**'   ':!.git/**'
then
  echo "Unexpected Luker namespace remains in active Atria code."
  exit 1
fi
```

If a tiny number of intentional historical references must remain, use a narrow explicit allowlist by exact file/path and explain each one. Do not use broad exclusions that hide real residuals.

## 7. Testing requirements

Minimum before merge:

1. targeted dispatch/generation tests;
2. orchestrator tests;
3. Memory OS / memory graph tests affected by tool renames;
4. search/context/docs tool tests;
5. persistence/checkpoint tests;
6. Termux script syntax checks where practical;
7. `npm run lint`;
8. full Node unit test suite;
9. Android JVM tests;
10. frontend build;
11. Atria namespace residual guard.

If Android bridge/frontend integration files change, also run the existing Android debug APK build.

If Docker or packaging paths change, validate their workflow/build.

## 8. Data-loss expectation

This refactor intentionally creates a clean Atria namespace.

After the migration, old Luker-specific runtime state may no longer appear:

- prior agent-runtime checkpoints;
- prior orchestration state;
- prior Luker-namespaced memory/plugin state if it was stored under Luker-owned namespaces;
- old portable orchestrator profile formats;
- old toolbox state;
- old config keys.

That data loss is accepted by design.

Core SillyTavern data must not be deleted merely because it is upstream data. Character cards, chats, world info, standard presets and other SillyTavern-owned formats should remain unless a specific Atria subsystem stored them under a Luker-only namespace.

## 9. Git workflow

1. Work only on `refactor/atria-namespace-migration`.
2. Keep commits logically grouped by migration phase where useful.
3. Do not merge until the final residual gate and full required CI pass.
4. Before completion, write the implementation record to the permanent `docs` branch.
5. Open/finish the PR into `main`.
6. Verify the merged `main`.
7. Let the task-branch cleanup workflow remove this branch after merge.

## 10. Required final report

Before closing the task, report:

- baseline SHA;
- branch;
- major namespaces/files renamed;
- old runtime/persistence data intentionally abandoned;
- any SillyTavern-owned identifiers intentionally preserved;
- residual scan result;
- tests/checks actually run and their results;
- PR number;
- merge commit;
- docs-branch record path;
- confirmation that no Luker compatibility layer was added.

## 11. Stop conditions

Do not stop merely because the rename compiles.

The task is incomplete if any of these remain in active Atria code without explicit justification:

- `src/luker-*`;
- `public/*luker*`;
- `tests/*luker*`;
- `scripts/termux/*luker*`;
- `Luker.getContext`;
- `luker_generation`;
- `x-luker-*`;
- `luker_orch_*`;
- `luker_memory_*`;
- `luker_mg_*`;
- `luker_ctx_*`;
- `luker_docs_*`;
- `luker_web_*`;
- `Luker_AgentRuntime_*`;
- stale product strings saying Luker;
- live URLs pointing at `ZZZdragondYNGPHX/Luker`.

The intended end state is a clean Atria product namespace on top of SillyTavern.
