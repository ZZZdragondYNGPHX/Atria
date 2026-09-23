# P5 — Native Runtime Product UI validation

Date: 2026-09-23. Branch: `refactor/atria-model-prompt-settings`.
Validated/pushed commit: `0cb56b9a0d37789025fb8069d08f6f43ead2413d`.
Main unchanged: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`.

## Delivered

Routes is the primary Runtime view, alongside Models, Connections, Profiles and
Diagnostics. Replaced the Runtime compatibility controllers with Native DOM and
P1-backed authenticated configuration endpoints. No new Store or legacy profile
fallback. Stable identities and exact Library revisions are selectable; editing
Generation creates an immutable revision and does not move existing route refs.

Connections edit endpoint/transport and exact Secret ID, never credentials.
Models expose remote ID, tokenizer, limits, capability restrictions/overrides and
provenance. Routes expose Model -> Connection -> Generation -> Prompt -> ordered
Fallback, retry/time budgets and requirements. Same-role fallback links are
validated for missing targets/cycles with a bounded traversal before saving.
Missing and ambiguous roles explain remediation. Native Play errors preserve
machine codes and offer navigation to the owning Runtime section.

Diagnostics compiles through the exact P4 host/P2 service/P3 compiler and provider
render/token accounting, stopping before Secret resolution/send. Pinned Session
or Project identity is required. Preview never persists or sends. Successful
request evidence remains ephemeral; Diagnostics exposes effective config, budget,
context, prompt provenance, capabilities and fallback attempts. Preview's attempt
list is empty by definition. No new generation retry/fallback semantics.

Search projects P1 objects to stable-ID editor deep links. Save failure preserves
edits and cannot report success; successful save followed by failed reload is a
separate state which prevents duplicate submission. Loading/empty/error/retry and
configured states have UI. Mobile editors are viewport-sized, isolate the inert
background, contain Tab focus and return via Back/Escape.

After the new UI and visual acceptance, evolved only A6's Advanced Connection and
standalone Capabilities replacement checks plus the matching P0 evolution gate.
A6 Play/search/no-second-store and A8 human Review/Commit remain intact. Added P5
guard and extended the P4 CI workflow with P5 guard and browser scenarios.

## Actual local checks

- Initial P2/P4/P5 backend tests: **2 suites / 52 tests passed**. Includes real
  loopback HTTP/SSE P4 tests; preview snapshot/render equivalence, zero Secret/send,
  stale revision, authenticated CRUD, immutable revision pinning, invalid fallback.
- Broad FS/SQLite: **206 suites / 1811 tests passed** with
  `ATRIA_DISABLE_MYSQL_TESTS=1 ATRIA_DISABLE_POSTGRES_TESTS=1 npm run test:unit
  --prefix tests -- --runInBand native atria-shell game-runtime orchestrator`.
  This preceded the final small editor keydown reset and addition of the dedicated
  P5 UI test file. No claim of rerunning every broad suite after that change.
- Final focused: **6 suites / 39 tests passed** using `npm run test:unit --prefix
  tests -- --runInBand native/model-prompt-runtime-p4.test.js
  atria-shell/native-runtime-p5.test.js atria-shell/native-play-product.test.js
  atria-shell/product-search.test.js atria-shell/workspace-host.test.js
  atria-shell/native-generation-p4.test.js`. Includes failure/refresh distinction,
  remediation event, search stable-ID navigation and Native no-legacy dispatch.
- P0-P5 guards, P0 self-test, P2/P3 mutation self-tests, A1/A2/A6/A7/A8 and N9/N10
  guards passed. P0/A6 replacement checks were run after visual acceptance.
- Root `npm run lint` passed. Final focused JS lint and MJS lint (module/Node
  parser environment), changed-file `node --check` and `git diff --check` passed.
- `npm run frontend:prebuild-cache` passed; existing webpack cache was a hit.
  This is a successful prebuild-cache check, not a claim of a forced cold compile.
- Final real browser run in tests: `PW_NATIVE_CHANNEL=msedge npx playwright test
  e2e/native-session/04-native-runtime-p5.e2e.js
  e2e/native-session/03-native-generation-p4.e2e.js --project=e2e --workers=1`:
  **8 passed**. Isolated local servers; desktop 1440x1000 and mobile 390x844.
  P5 creates/edits connections and routes, publishes Generation revisions, compiles
  against a real Session without network credentials, opens exact editor links,
  checks keyboard/Back/Escape, loading/empty/error/retry and retained failed edits.
  P4 rechecks streaming/Stop/Timeline and Studio Create Task/Human Takeover.

Screenshots were actually inspected. Initial interaction passes were not accepted
as visual proof: screenshots exposed stretched desktop navigation, raw-JSON exact
ref labels, and a clipped/covered mobile editor. Fixed grid columns, canonical ref
matching and mobile portal/layer/explicit 100dvh height; reran screenshots. Added
actual viewport-height and hit-target checks. Final mobile editor, model form,
failed save, desktop editor, empty/error states and preview screenshots were read.
An intermediate browser attempt hit the overlay defect and was terminated after
its server exited; only the final eight-case run is acceptance. Initial unit
navigation failures were outdated transitional expectations and then passed.
Optional SD probes logged connection-refused warnings; no browser page errors in
accepted Runtime cases. Logs/screenshots are ignored under tests/test-results.

## Boundaries / P6 handoff

No main merge and no P6-P8 implementation. No Android/Docker, external live model
credentials, MySQL/PostgreSQL services, real mobile hardware, or all-repository
regression run. Existing Secret IDs must already be provisioned; no credential
creation or importer was added. Only documented OpenAI-compatible/raw-text
transports/controls work; unsupported configuration remains fail-closed.

P5 selects all exact Library revisions and retains existing Project/Package route
refs; new scoped-resource picker/authoring belongs to P6. Prompt visual authoring
is not in P5: a fresh install without a Prompt Program must use existing A1/P1
provisioning until P6. Diagnostics uses the active Session or explicitly entered
Project ID/revision; it does not invent a synthetic context or claim a real send.
Latest successful request evidence is in-memory only; failed requests do not gain
a persistent trace subsystem. Settings/legacy cleanup and localization remain P7.
