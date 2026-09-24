# Phase 8 — Final Acceptance

Date: 2026-09-24–25 (Asia/Shanghai). User authorized final integration and push after verification.

Validated implementation: `1f0db8886aa9a34c43b89fcf3c162523498dc759`.
Main integration: `ad15c1e0c3e15e625ba163e284a300c00811f10d`.
The integrated tree equals the validated branch exactly. Aggregate guards and
both Native operation browser cases passed again on main before its push.
Remote main was verified at the integrated HEAD; the completed task branch was removed.

## Baseline and scope

Fetched main was `402b53a98a823573591db4e9fd015f98e6effbdb`; the retained
`refactor/atria-product-frontend-redesign` branch started at
`a30698dda124eb5544afe7c2e37d0d3f7fd56d6c`. Phase 1 was already integrated;
Phases 2–7 were reviewed and accepted as the implemented design baseline.
No foundation redesign, new router, persistence/configuration authority or
Native generation ABI was introduced. SillyTavern onboarding imports remain retired.

## Acceptance corrections

- Fixed Play More-menu focus dismissal. A focusout microtask could observe body
  between blur and focus, close the menu before the destination button's click,
  and silently swallow Retry/Re-enter/Quick Save. Dismissal now checks
  `FocusEvent.relatedTarget`; internal focus stays open, outside focus dismisses.
- Re-enter Turn now also restores the draft and focus in the visible Shell-owned
  composer. It still uses the existing Native Session operation and internal
  generation input; no committed Timeline mutation or second draft authority.
- Made the e2e seed clone portable using Node `cpSync` with optional reflink
  support. Windows previously failed before browser startup on missing Unix `cp`.
- Fixed the plugin fixture's Windows path with `fileURLToPath`.
- Updated stale presentation expectations: native Build instead of retired Studio,
  Native Library/Play destinations, the single responsive Agents navigation strip,
  optional Inspector selection and whitelisted Settings controls. MovingUI remains
  hidden compatibility data and cannot alter Shell geometry.
- Replaced obsolete editable-chat/swipe browser scenarios with real Native HTTP
  generation, Retry, Re-enter, Quick Save, Timeline restart, historical revision
  immutability, Stop and a subsequent send after Settings navigation. Assertions
  retain one internal ABI and unchanged legacy chat/character/world/file trees.
- Positive browser plugin coverage now enables/disables an actual temporary
  third-party extension through the existing extension controller.

## Executed validation

- Broad offline units: **176 suites / 1228 tests passed**, roots `atria-shell`,
  `native`, `game-runtime`, `agent-runtime`, `skills-ui`, `logging`.
  Existing `ATRIA_DISABLE_MYSQL_TESTS=1` and `ATRIA_DISABLE_POSTGRES_TESTS=1`
  controls excluded unavailable database services; filesystem and SQLite ran.
- Storage migration controller, retired onboarding import routes and backup
  roundtrip: **2 suites / 22 tests passed**.
- Play controls and real HTTP model/prompt runtime follow-up:
  **2 suites / 27 tests passed** after the menu fix.
- Full repository frontend/server lint passed; changed test files and final
  `public/script.js` passed explicit ESLint. `git diff --check` passed.
- Aggregate `node scripts/check-p8-model-prompt-integration.mjs` passed, including
  P0–P7, A0–A9, N9/N10, exact reads, no dual-write and no Native hidden fallback.
- Two cold `npm run frontend:prebuild-cache -- --dataRoot <isolated scratch root>`
  builds compiled successfully. Browser runs served real application modules.
- Browser validation used installed Edge via an uncommitted Playwright config
  extending the repository config, `channel: 'msedge'`, one worker, no video/trace.
  It did not depend on GitHub CI or an external model provider.

Browser coverage (distinct cases; reruns are not added to totals):

| Scope | Cases | Evidence / contract |
| --- | ---: | --- |
| Entry 01; Native 07–11 redesign suites | 41 | Desktop/medium/320px; dark/light; loading/error/retry; dialogs/toasts; keyboard/focus; exact authoring and responsive composition |
| Shell 01, 02, 04, 05, 07, 08 | 23 | Frame/navigation/history/transients, Native operation continuity, workspace ownership, plugin persistence, Settings/Account and recovery |
| Shell 03, 06; Native 02, 03, 05 | 12 | Native Game Component/Hybrid/Full recovery, Library/Runtime routes, real HTTP streaming/Stop, Project Agent generation/human takeover, exact Library/Studio authoring |

Final Play-menu follow-up reran Native 07 (8 cases). The new Shell 02 operation
chain is also rerun after each discovered product fix. See latest handoff for the
integrated HEAD and final integration verification.

The initial broad run exposed stale preset-help mocks and unavailable MySQL/Postgres
ports, not failed filesystem/SQLite semantics. Initial browser runs exposed the
Windows harness defects and obsolete presentation assertions described above.
All affected cases were corrected and rerun. Optional legacy SD discovery logged
connection-refused warnings in some seeded suites; no SD provider was exercised.

## Visual and interaction review

The established `frontend-design` direction was retained. `ui-ux-pro-max` assisted
workflow, navigation and focus review. Real browser screenshots were opened and
inspected at 1440px, 900px and 320px, including light Chinese large-text settings,
compact Library and Runtime forms, Studio review/Inspector, Play's virtual keyboard,
onboarding, compatibility plugin controls and the preset naming dialog.
The tests also exercise 390px, medium boundaries, simulated safe areas, compact
keyboard viewport changes, horizontal overflow, failed input retention and Escape.

Post-implementation [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md)
review covered labels, focus visibility, async feedback, reduced motion and overflow.
Emil design-engineering review:

| Before | After | Why |
| --- | --- | --- |
| More could close between pointer blur and click | Internal focus transitions preserve the menu until activation | Actions must respond reliably to real pointer input |
| Re-enter focused the invisible ABI input | The visible composer receives draft, resize event and focus | Continue editing where the user is looking |
| Old tests required retired presentation | Current product surfaces retain authority assertions | Regression checks should protect behavior and approved design |
| Plugin browser fixture could not start on Windows | Portable fixture path and explicit compatibility disclosure | Verify the actual controller on the available platform |

No new visual specification was required; the fixes fulfill existing interaction
contracts. Selected fresh evidence is in [phase-8-images](phase-8-images/).

## Limits and local state

This is local desktop browser acceptance, not physical Android/Termux/WebView/IME
certification. Safe-area and virtual-keyboard checks are simulations. No Android or
Docker build was requested or run. HTTP generation uses a local synthetic provider,
not the user's live external model credentials. MySQL/Postgres integration,
authenticated multi-account permutations, arbitrary third-party plugins and the
entire repository's unrelated tests were not claimed. Existing backup/storage
controller copy includes Chinese-first text.

Pre-existing user/external edits to root `AGENTS.md` and `FORK_MAINTENANCE.md`
were preserved and excluded from task commits. Prior Phase 6/7 cleanup was rejected
by automatic approval review (`blocked by policy`); those paths were not retried.
Cleanup of this phase's own result directories, two cold-build caches and isolated
action fixtures was also rejected by automatic approval review (`blocked by policy`).
No alternate deletion was attempted. Local test data, results and caches remain
uncommitted. Only selected visual evidence is stored on docs.

No further redesign phase is scheduled. Subsequent work starts from integrated
main and a new task-specific branch; do not restore retired migration support.
