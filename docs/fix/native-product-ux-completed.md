# Native product UX completed work

Task branch: `fix/native-product-ux-audit`.
Baseline: `main@ad15c1e0c3e15e625ba163e284a300c00811f10d`.
Workspace `AGENTS.md` and `FORK_MAINTENANCE.md` take precedence over the obsolete remote copies.

## Group 1 — User Data Safety

### NUX-001

Commit: `426017c8e`.
Registered Native resources, Studio projects and asset blob directories centrally.
ProjectStore, AssetStore and FS resource reads/writes consume the shared contract.
Existing physical paths remain unchanged. The FS harness uses the real registry.
Focused validation: four suites / 13 tests; changed-file ESLint and diff check.

### NUX-002

Native backup is a single selectable closure: all Native resource kinds, Studio
source projects and Native asset/package blobs. Secrets remain a separate choice.
SQL downloadable dumps now filter selected tables; recovery snapshots remain full.
Assets-only backup/restore excludes and preserves the Native blob subtree.

MigrationRunner copies all registered Native kinds through the existing engine
transaction contract, retaining exact IDs, documents, integrity and timestamps.
Restore staging rebinds only the user storage key for FS and SQLite sources.
Native restores validate required blob hashes and lengths before replacing data.
Overwrite rejects archives without a declared Native closure. Recovery checks
engine compatibility before deleting anything and closes SQLite handles before
replacing files on Windows.

Backup uses the existing migration lock and read-only gate while archiving.
Migration write bypass is async-local, preventing unrelated concurrent requests
from bypassing the gate. ProjectStore writes honor the same gate.
The existing backup UI exposes the Native option with English, zh-CN and zh-TW
copy, existing checkbox styling and keyboard behavior.

Group regression executed:

- 23 offline suites: 203 passed, four database-service cases skipped. Includes
  migration, snapshots, rollback, selection, read-only concurrency, Native layout,
  project composition/build and HTTP backup/restore.
- Eight Native HTTP scenarios cover FS → FS, FS → SQLite, SQLite → FS,
  SQLite → SQLite, missing-blob rollback and assets-only isolation.
- All 22 registered Native storage kinds are included in the HTTP round trips.
- One real Edge browser scenario passed at 320px: utilities error/recovery,
  Native backup selection, keyboard toggle, recommended selection and overflow.
  Inspected its backup screenshot. Existing visual language retained.
- Changed-file ESLint and `git diff --check` passed. The CLI file's single engine
  injection line was syntax checked; its pre-existing unrelated lint errors were
  not rewritten.

Limits: local MySQL/Postgres test ports 53306/55432 are unavailable. Their live
integration is not claimed. No Docker/Android build or physical-device validation.
Playwright bundled Chromium installation stalled during extraction; browser
validation used installed Edge through an untracked local test configuration.
Pre-existing workspace rule edits and old test artifacts remain excluded.

## Group 2 — Native Runtime / Provider Foundation

### NUX-003

Production registers four Native adapters. All use the existing exact Runtime
Route, configuration, PromptIR, capability and Secret-at-send boundaries.

| Adapter | Tools / structured output | Reasoning | Explicit cache |
| --- | --- | --- | --- |
| OpenAI-compatible messages | Function tools, JSON Schema | effort | key, in-memory / 24h retention |
| Anthropic Messages | Function tools, JSON Schema | adaptive effort or enabled token budget | automatic ephemeral, 5m / 1h |
| Gemini GenerateContent | Function tools, JSON Schema | budget or level | unsupported |
| Raw text completions | unsupported | unsupported | unsupported |

All support streaming. Protocol capability evidence does not override known
unsupported model capabilities. Unknown fields/combinations fail before Secret
resolution. Anthropic/Gemini preserve leading system authority and reject
interleaved system slots that cannot retain their original position. Unsupported
modalities fail rather than disappearing. Signed provider tool content survives
the Studio loop and remains bound to the connection, model and original message.
Their local budget check uses a conservative UTF-8 byte bound, not an inaccurate
OpenAI tokenizer. Gemini external cached contexts are rejected because their
unavailable contents cannot participate in Native context accounting.

Runtime editors reuse existing fields, focus, responsive sheets and translations.
Gemini accepts an API base URL; other transports accept the generation endpoint.
Provider model discovery and connection health remain NUX-005, next after NUX-004.

Validation: seven focused/adjacent suites, 120 tests passed; final changed tests
rechecked (15 passed). Real local HTTP covers both new protocols, streaming and
nonstreaming authentication. Real Edge narrow/light profile editing and exact
revision preservation passed; inspected the 320px provider-controls screenshot.
Changed-file ESLint and diff checks passed. Live paid provider accounts were not
used; protocol behavior is tested against controlled HTTP servers.

Protocol references: [OpenAI Chat](https://developers.openai.com/api/reference/resources/chat),
[Anthropic Messages](https://platform.claude.com/docs/en/api/typescript/messages),
[Anthropic thinking](https://platform.claude.com/docs/en/build-with-claude/extended-thinking),
[Anthropic caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching),
[Gemini generation](https://ai.google.dev/api/generate-content),
[Gemini thinking](https://ai.google.dev/gemini-api/docs/thinking).

### NUX-004

Connection setup now selects labeled exact Secret references or creates a Secret
inline. The authenticated Native inventory returns IDs/labels only, independent
of secret exposure preferences. Creation reuses SecretManager and its atomic
file store under an Atria key; it does not rotate active credentials. The Native
backup write gate applies. Connections never receive the key value.

The existing editor handles empty/loading/retry, failed creation, double clicks,
stale inventory responses, cancellation and clearing sensitive inputs after
success/cancel. Secret selection and create fields use existing form primitives
and Chinese translations. Creating a Secret and saving a connection remain
explicit separate actions.

Validation: three suites / 35 tests passed, covering real authenticated Secret
HTTP, metadata-only output, ownership rejection, write gate, exact selection,
creation retry and existing generation contracts. Two real Edge 390px scenarios
passed including Secret creation, connection save failure/retry and configuration
loading recovery. Inspected the connection screenshot. Changed-file ESLint and
diff check passed. Only synthetic credentials were used.

Next: NUX-005, following the active backlog order.
