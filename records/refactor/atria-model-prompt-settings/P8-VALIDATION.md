# P8 — Hard Cut / Integration / Freeze

Date: 2026-09-23. Work branch: `refactor/atria-model-prompt-settings`.
P7 baseline: `bde2fbc1ed58bc8f9a915dc7c2e72c210917c245`.
P8 implementation: `ca0c9e7008556613e44f02a163ceb92d56b5356d`.
Workspace follow-up: `cf9f3b1bc828e699b3c3ae114534b906423c2453`.
Final work HEAD: `de6fe31` (responsive inspector browser interaction fix).
PR: https://github.com/ZZZdragondYNGPHX/Atria/pull/85
Baseline main: `2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`.
Integration status: MERGED through PR #85 on 2026-09-23 at 13:26:30 UTC.
Integrated main: `c664eded79b86df37bd951f1e5236a4335ce784b`.
Local workspace is on main; completed temporary branch deleted locally/remotely.

## Final audit and implementation

P8 audited the complete main-to-task diff and P0-P7 contracts/persistence/compiler/
provider/host/product paths. The existing exact Store/Library/Project/Package,
Session publication and A1/A8 human authority remain the only authorities.

Two gaps were closed:

1. The HTTP host previously discarded an explicit route scope before resolving a
   player route and preferred Session when both context identities were supplied.
   It now rejects non-player/extra-owner route refs and ambiguous context before
   configuration reads, Secret resolution or sending. Missing/unknown scopes are
   not silently interpreted. The Core Session-route port is still a valid port,
   but current HTTP provisioning explicitly supports player routes only.
2. The first-party compatibility facade previously used only loaded-Session state
   to select legacy dispatch. In a mounted but empty Native Shell it could fall
   into ST. Both streaming and nonstreaming now fail for missing Native context;
   they never call a legacy sender or legacy streaming preset lookup. Explicit
   non-Native host/recovery retains compatibility. Browser/poisoned-port tests
   prove the empty-Shell boundary, not merely a static assertion.

Added the P8 aggregate guard: P0-P7, A0-A9, N9/N10 plus exact reads/no request-time
writes/Native no-fallback checks and mutation detection examples. N0-N8 contract,
Session, Context, Package and Save invariants are covered by Native tests and the
final N9/N10 guards; no standalone N0-N8 scripts exist to run.

The five temporary phase-only workflows are replaced by the permanent
`model-prompt-runtime.yml`, which runs on main, PRs and the work branch. It runs
all relevant tests, aggregate guards, root lint, frontend compilation and real
browser acceptance, with failure artifacts. It explicitly rebuilds better-sqlite3
with `--ignore-scripts=false`: inspection of P7 remote run 35861505837 showed
37 failures in seven SQLite suites because `.npmrc` sets `ignore-scripts=true`.
This remote CI defect was not the four Windows storage failures from P6. It is
fixed by provisioning the native binding, not disabling SQLite or weakening tests.

The runtime README was rewritten as a current integrated API/composition reference,
removing stale P2/P3 future promises and P5/P6 TODO statements. It documents HTTP
scope/owner/revision semantics, limits, capability tri-state, explicit providers,
Secret/send-only boundary, compile-only preview, retries/fallback, Package freeze,
product ownership and allowed non-Native islands.

## Checks actually executed

- Final relevant Native/atria-shell/game-runtime/orchestrator regression with
  FS/SQLite: **210 suites / 1844 tests passed**. MySQL/PostgreSQL disabled locally.
  In `tests`, with `ATRIA_DISABLE_MYSQL_TESTS=1`, `ATRIA_DISABLE_POSTGRES_TESTS=1`:
  `node --experimental-vm-modules node_modules/jest/bin/jest.js --config
  jest.config.json --runInBand native atria-shell game-runtime orchestrator
  --testPathIgnorePatterns p6-baseline /node_modules/ /frontend/
  /skills-ui/playwright/ --modulePathIgnorePatterns p6-baseline`.
  The ignored P6 baseline worktree is excluded from test discovery.
- P8 aggregate guard passed, including P2/P3 guard mutation self-tests and A9.
- Root `npm run lint`, focused touched JS/test lint and JS/MJS syntax passed.
  Complete `git diff origin/main...HEAD --check` passed after removing one trailing
  blank line in the pre-existing P5 browser fixture (no semantic test change).
- **Cold frontend compile passed**, webpack 5.106.1, 20.603s compiler run.
  `node scripts/prebuild-frontend-cache.js --dataRoot tests/.e2e-scratch/p8-cold-build`
  used a fresh ignored data root; evidence logged `hit=false`, `source=compiled`. This is not
  a cache-hit check, Android build or Docker image build.
- Local real-server Playwright/Edge P4-P7 browser: **all 12 cases passed**.
  Desktop 1440x1000 / mobile 390x844, including actual generation/Stop, A8 takeover,
  Runtime exact config/preview/errors, Library/Studio Review/Fork/freeze discovery,
  Settings and locale reload, exact search and empty-Native-Shell fail-closed.
  Optional Horde discovery is isolated in P6/P7 fixtures; Native endpoints are real.
  SD connection-refused probes remain unrelated warnings.
- Remote PR checks: **all eight checks passed** on `de6fe31` before merge.
  Full Linux unit job: **776 suites / 8914 tests passed**, run `35866145468`.
  Native integration push/PR: `35866137367` / `35866145242`; Workspace browser:
  `35866145235`; Worldbook/performance: `35866145234`; immersive regression:
  `35866145595`. Lint and migration guard also passed in the PR checks run.
  These remote results are distinct from the local Windows FS/SQLite count.
- Post-merge verification: fetched and checked out `main@c664ede`; exact tree
  comparison against validated `de6fe31` returned no difference; P8 aggregate
  guards reran successfully; diff check and working tree were clean. Removed the
  fully merged temporary branch locally/remotely. No additional full test rerun
  was needed for the identical tree; no separate post-merge CI result is claimed.

## Workspace integration follow-up

The append-style Agents adapter left the Shell's loading placeholder mounted.
The host now removes only its own activation's loading node after mounting, with
a regression test. Embedded Workspace capacity is measured by a CSS container;
at constrained desktop widths the inspector is a closable overlay, preserving
the main pane width. Mobile retains its existing independent layout.

The prior PR Workspace run 35864426534 failed because Duplicate opens the new
agent's inspector, while the next test action clicked the covered preset menu.
The test now asserts the inspector is visible, captures it, and clicks the real
Close inspector button before continuing. No force click or hidden DOM mutation.
Local real-server Edge Workspace mobile entry + desktop binding/reload acceptance:
**2 tests passed**. Mobile entry, open inspector and reloaded desktop screenshots
were inspected; the close control is visible, bindings survive reload, and the
loading placeholder is gone. Focused test lint has zero errors and two existing
conditional-in-test warnings. This follow-up does not alter runtime authority.

Visual acceptance: desktop/mobile Play, Runtime editor/preview/error, Library
Prompt editor, Studio authoring/human Review, Settings/appearance, exact search,
Chinese Prompt/Settings and Workspace screenshots inspected. No unresolved
layout or interaction defect was observed in these accepted flows.
No unexecuted tests or earlier phase counts
are represented as current P8 passes. The initial targeted run exposed one old
missing-route fixture without a scope; it was corrected to use a valid explicit
player ref so it continues testing missing route rather than malformed ref.

The final local invocation selected the entire `e2e/native-session` directory,
so it also attempted historical N4/N10 browser specs 01/02. Their two entry cases
could not launch because the bundled Chromium executable was absent; these specs
do not honor `PW_NATIVE_CHANNEL=msedge`. Three dependent N4 cases did not run.
Overall invocation: 12 passed, 2 launch failures, 3 not run. All P4-P7 cases used
installed Edge and passed. This is not a claim that the entire historical browser
directory passed. Permanent CI explicitly selects current P4-P7 product acceptance.

## Integration / residual boundaries

Allowed explicit host islands: mature tokenizer/provider implementation, existing
Secret Store adapter, bootstrap/DOM host bridge, non-Native ST chat/recovery and
third-party compatibility. Native product/core never resolves legacy preset names,
reads legacy globals, dual-writes prompt state or silently retries through ST.
Navigation-only old section redirects are not runtime resource identity/fallback.
No request to delete all SillyTavern implementation was inferred.

Supported production transports remain OpenAI-compatible messages and raw-text.
Anthropic/Gemini renderer fixtures are not transport support. Secret provisioning
is still existing infrastructure. Preview uses committed exact context, not drafts.
Library multi-resource Fork can leave unused dependency revisions after a failed
partial publication; originals remain unchanged and no root success is claimed.
These documented limits are not hidden migration bridges.

No Android/Docker image builds, external model credentials or real mobile hardware
were invoked. Local full storage extension was not rerun: P6 documented four Windows
SQLite restore/WAL cases reproducible on unchanged P5. Remote PR's normal existing
SQL jobs, if passed, are reported separately from local checks. Old N4 legacy-DOM
browser fixture is historical; current N9/A6/Native Play acceptance is covered by
P4-P7 real product browser cases and the full relevant Native regression, not by
pretending the pre-product ST composer is the Native product UI.
