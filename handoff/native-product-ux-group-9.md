# Native product UX — Group 9 and final closure

Branch: `fix/native-product-ux-audit`.
Baseline: Group 8 `42265308d4b08964c71ddfbcbbccf7730bda4a4a`.
Final HEAD: `652bb6386f61e9c5fb983157c8852b1680736eb2`.

Issue commits: NUX-043 `9e66b5c81`; NUX-044 `652bb6386`.

### NUX-043

Global Search now declares its supported domains and indexes Sessions, SavePoints,
exact Knowledge entries, scoped Skills and Agents orchestration presets alongside
existing Library/Build/Runtime resources (including Retrieval). Results navigate
through WorkspaceHost. SavePoints open their committed revision for inspection;
search does not restore progress. Knowledge entries use the indexed exact revision
in a read-only detail. Skills retain their complete scope and PackageVersion.

Refresh catches synchronous, authority-level and individual-owner failures,
keeps successful domains searchable and exposes partial availability, affected
sources/owners, error details and retry in the existing palette. Concurrent/stale
refreshes cannot replace newer results or disposed state. Coverage disclosure is
keyboard-accessible and preserves expansion while filtering.

Validation: 80 Shell/Agent/Skills suites, 629 tests passed; expanded host deep-link
suite 11 tests passed; immutable entry, Shell and localization suites 15 tests
passed. Focused search coverage includes all new entities, source failure/retry,
concurrent refresh and disposal. Real Edge at 390px verified SavePoint inspection,
exact orchestration selection, successful results during a Worlds failure, and
retry recovery. Changed JavaScript lint and git diff whitespace checks passed.


### NUX-044

Completed the current Native/Shell/Agents/Skills/Regex/Search Tools localization
pass in zh-CN and zh-TW. Stable keyed templates replace pre-concatenated translation
lookups, including Runtime readiness/fallback counts, authoring validation and
recovery messages. Studio HTTP failures use the established Native product error
mapping. Existing catalogs remain the authority; no additional i18n system or
visual redesign was introduced.

User-authored resource, preset and Skill names, exact references, provider/model
IDs, paths and source literals stay unchanged. Search supports translated command
copy while preserving literal result titles. Detail routes and authoring pickers
preserve authored names even when they match a translated action such as Save.

`npm run check:native-localization` adds AST/catalog coverage for both locales,
placeholder identity, recognized hard-coded UI/accessibility copy and dynamic
translation calls. Its focused regression verifies rejection examples as well as
literal-value preservation and Chinese command discovery. Scope and maintenance
contract: [Native product localization](native-product-localization.md).

Validation: related Native/Shell/Agents/Memory/Experience/Skills/Regex/Search suites
passed 355 suites / 3541 tests (72 optional external-database skips). The final
localization suite rerun passed all four cases. Full JavaScript lint, new test/guard
lint, locale guard, frontend cache compilation, git diff checks and all six
A3/A4/A5/A6/A9/P4 boundary scripts passed. Existing Knowledge E2E conditional-test
warnings remain; there are no lint errors.

Native data-integrity validation passed four suites / 40 tests (two optional DB
skips), including resource/metadata/project/blob backup restore across FS/SQLite
and exact Native resource FS-to-SQLite-to-FS round trip. Missing blobs fail safely.

Real Edge verified Search source failure/retry and exact SavePoint/preset navigation;
zh-CN 390px and zh-TW 1440px verified dynamic Runtime copy, loading/error/retry,
Library/search names, and Work/Global Plugins. Rendered normal and failure states
were inspected. All ten adjacent Runtime browser cases passed. Old reference-list
assertions were updated to current owner cards, and Studio sequencing now waits
for Apply UI completion after persistence before starting another ChangeSet.


### Group 9 / final regression outcome

All 27 selected browser scenarios now have passing final evidence: ten Runtime,
eight Knowledge/Library, six Studio/Skill/asset/Source/Prompt, one Search and two
Chinese localization scenarios. This is the combined verified result, not a claim
that every exploratory invocation was green. The broadened pass exposed stale
reference assertions, an Apply/persistence synchronization race in a test, and a
lint autofix that incorrectly replaced a scalar fork ID with a Locator. These test
issues were corrected; reference sequencing and World history each passed their
focused rerun, and the remaining ten authoring scenarios passed together.

Groups 1–9 and NUX-001 through NUX-044 are complete. Active backlog is empty.
No main merge, physical Android/device check, Docker build, live MySQL/PostgreSQL,
paid provider request or GPU inference is claimed. Earlier whole-repository optional
DB/Windows-sensitive failures remain documented under Group 8; the final related
355-suite run and FS/SQLite integrity checks are green.

Workspace AGENTS.md/FORK_MAINTENANCE.md edits and prior Phase 6–8 artifacts were
preserved. Automatic approval review rejected cleanup of task-only test output
folders and audit scripts as blocked by policy. Local artifacts remain uncommitted;
no caches, credentials, binaries, test data or machine configuration were staged.
