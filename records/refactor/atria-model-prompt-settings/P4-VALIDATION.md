# P4 — First-party Runtime Cutover validation

Date: 2026-09-23. Branch: `refactor/atria-model-prompt-settings`.
Validated/pushed commit: `6cba266814a7ff04666220f1031efdb844ad4e46`.
Main unchanged: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`.

## Delivered

Authenticated Native generation endpoint composes P1 persistence/exact Library,
existing Session/Studio authorities, P2 resolver/service and P3 context/compiler.
Session/Project revisions and Studio Task stop states are checked before send.
Concrete OpenAI-compatible/raw-text HTTP/SSE adapters use explicit profiles and
exact Secret IDs; tools/JSON Schema are real OpenAI protocol fields. Host retries
finish on the primary route before complete-route fallback. Native terminal errors
cannot be replayed by outer legacy retry loops. Credential-prefix stream tails are
withheld until safe; final output is checked before publication.

Game Runtime/Role Router, Native Play, Studio Agent, Orchestrator, Memory/Search
and the shared iteration sender use the new seam. Native preset and old World Info
resolution are bypassed. All roles consume the same exact Prompt resource store;
P3 projection/parameters/artifacts remain available. Host identity is read-only.
Task/tool transcripts follow selected input without an empty/repeated user turn.

Studio retains projected backend tools, pinned base revision, read-only Skills and
human Review/Commit/Takeover. Fixed Create Task's running flag blocking initial
Continue. A8's verified replacement assertion now requires executeNativeGeneration;
other A8 gates and all A6 gates remain. Legacy non-Native generation is isolated in
an explicit compatibility module; the runtime README lists residual UI exceptions.

Native Play preserves Draft/Revision, Retry/Continue and Game/Orchestrator bridges.
Stream drafts are presentation-only; Stop cannot commit late/partial text. Browser
screenshots exposed horizontal Play-host layout and hidden grid-slot shifts at
390px; fixed layout, toolbar styling, visible streaming/Stop and uncaught abort.
Added P4 guard (228 first-party files), poisoned-legacy tests, loopback HTTP tests
and real browser E2E. Fixed A9 test's Windows file-URL conversion.

## Actual local checks

- Focused P2/P3/P4 host/client/Play/A9: **6 suites / 98 tests passed**. Command:
  `npm run test:unit --prefix tests -- --runInBand native/model-prompt-runtime-p4.test.js native/model-prompt-runtime-p3.test.js native/model-prompt-runtime-p2.test.js atria-shell/native-generation-p4.test.js atria-shell/native-play-product.test.js atria-shell/hard-cutover-a9.test.js`.
- Broad: **206 suites / 1807 tests passed**. Set existing switches
  `ATRIA_DISABLE_MYSQL_TESTS=1`, `ATRIA_DISABLE_POSTGRES_TESTS=1`, then run
  `npm run test:unit --prefix tests -- --runInBand native atria-shell game-runtime orchestrator`.
  FS/SQLite contracts ran. Earlier unfiltered run: 198 suites passed, seven failed;
  six needed unavailable MySQL/PostgreSQL services, one had A9's fixed Windows bug.
- After final WI/outer-retry refinements: **143 suites / 1744 tests passed** via
  `npm run test:unit --prefix tests -- --runInBand memory-graph search-tools orchestrator atria-shell/native-generation-p4.test.js`.
  Includes three new terminal no-retry cases. Counts overlap; do not sum them.
- P0/P1/P2/P3/P4 guards, P0 self-test, P2/P3 mutation self-tests passed.
  A1/A2/A6/A7/A8 and N9/N10 guards passed. Only authorized A8/P0 replacement checks
  changed; other frozen guard bodies remain.
- Root lint passed. Focused final source/test lint, JS/MJS syntax and diff checks passed.
- `npm run frontend:prebuild-cache`: webpack compiled successfully; final repeat
  confirmed the cache. Generated bundles remain ignored.
- In tests, `PW_NATIVE_CHANNEL=msedge npx playwright test e2e/native-session/03-native-generation-p4.e2e.js --project=e2e --workers=1`: **4 passed**.
  Real isolated local Atria servers, synthetic loopback provider, desktop 1440×1000
  and mobile viewport 390×844. Actual Send/live draft/Stop/Timeline and Studio
  Create Task/Human Takeover interactions. Asserted no partial draft in committed
  Timeline and no browser page errors. Captured and personally inspected Play,
  Timeline, stream/stopped and Studio screenshots, rerunning after fixes.
  Browser download did not finish; installed Edge was used. Initial Stop exposed
  an uncaught abort, fixed before the final run. Optional SD service probes logged
  connection-refused messages; these were unrelated to model generation.

Logs/screenshots remain under ignored tests/test-results. No user data, generated
binaries or live credentials were committed. CI workflow is repeatable coverage,
not the local acceptance oracle.

## Limits and next-stage obligations

- No live external model account or real mobile device certification. Transport
  tests used actual loopback HTTP/SSE plus browser/server integration.
- Only two documented adapters/controls are implemented. Unsupported configuration
  fails closed; Anthropic/Gemini remain P3 render-only fixtures.
- Native users need explicit P1 route/model/connection/resources. P5 supplies
  configuration/remediation UI. Missing routes never choose active legacy presets.
- Native legacy Generate dryRun is rejected; preview must use a Native compiler
  seam without sending/persisting, not the old prompt builder.
- Default fallback is disabled; Game Runtime explicitly requests automatic routes.
  P5 must expose policy intentionally.
- MySQL/PostgreSQL variants not validated. Android/Docker were not run.
- P4 only: no main merge, no new work branch. Stop before P5 until continuation.
