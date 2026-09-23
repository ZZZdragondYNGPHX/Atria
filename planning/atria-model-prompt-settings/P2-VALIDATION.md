# P2 Generation Core & Route Resolution

Status: implemented; P3 has not started. Implementation HEAD is recorded in latest-handoff.md.

## Delivered

- GenerationService.execute on the frozen P0 ports/artifacts and P1 authorities.
- Common RouteResolver reads player profiles/routes from NativeModelPromptPersistence;
  Library exact resources from getExact; Project/Package/session values through explicit
  owner-bound read ports. Exact owner/identity/revision mismatch and dependency cycles
  fail closed. Recursive Prompt dependencies are resolved without compiling them.
- Capability supported/unsupported/unknown with combined provenance. Unsupported always
  fails; required unknown needs an explicit per-request override and retains unknown
  state plus user-override provenance. Streaming/reasoning/tool-choice controls require
  capability evidence; tools/output contracts cannot silently disappear on fallback.
- Full-route bounded fallback only for typed provider/transport/send-timeout failures.
  Cancellation, Secret Port, configuration, capability, budget, parsing and application
  failures do not trigger fallback. Default fallback is disabled; confirm requires
  explicit host resubmission. Role Router retains retry ownership.
- Deep request-local immutable input/config/snapshot. Non-secret effective configuration
  lives in the existing snapshot diagnostics field; no P0 ABI replacement.
- Secret Port resolves only at send boundary with authenticated owner handle. No secret
  enters rendering, snapshot or diagnostics; raw error causes are discarded, credential
  echoes rejected. No Package/Project/Library write path exists in P2 execution.
- Explicit-config OpenAI-compatible and raw-text adapter, injected tokenizer/send/stream
  ports. Unsupported adapter controls fail closed. Stream responses are assembled before
  normalization; live token callbacks are not part of P2.
- P2 architecture guard, positive/negative mutation self-tests and CI workflow added.
  Local validation was performed before pushing; CI was not used to discover failures.

## Local validation

Environment: Windows, Node 24.16.0. Root and test npm dependencies installed locally.

- P2 focused: 33 tests passed, including actual loopback HTTP and streamed response parsing
  for both adapters, complete A→B vs direct B equivalence, exact revisions, recursive
  dependencies, project/package/session owner checks, capability policy, cancellation,
  timeout, error eligibility, owner-aware Secret Port, credential echoes, and concurrent
  role/route/model/generation-config isolation.
- Native + matched adjacent suites: 48 suites / 347 tests passed. FS and SQLite run;
  repository-provided ATRIA_DISABLE_MYSQL_TESTS=1 and ATRIA_DISABLE_POSTGRES_TESTS=1 used
  because no local database services or Docker runtime were available.
- Initial focused/adjacent run: 10 suites / 66 tests passed, before four final P2 additions.
- P0/P1/P2 guards passed; P0 and P2 negative/positive self-tests passed.
- A1/A2/A7/A8 guards passed, unchanged. A6/A8 replacement gates remain unchanged.
- Root npm run lint and focused source/test ESLint passed.
- New source/guard syntax checks and git diff --check passed.
- npm run frontend:prebuild-cache passed (webpack 5.106.1); output stayed in a temp directory.

Broader verification found two environment prerequisites and one stale test expectation:

1. npm ignore-scripts was enabled in local configuration. Rebuilt better-sqlite3 with
   explicit --ignore-scripts=false --foreground-scripts, then verified an in-memory query.
2. MySQL/PostgreSQL endpoints were unavailable; those optional engines are explicitly excluded.
3. N9 product-service expected dependencies omitted P1's existing resources: [] field.
   Updated only that expectation; P1 production code and frozen authority remain unchanged.

## Limits / next phase

- No real account/Secret/provider call was made; transport integration used loopback fixtures.
- Browser product acceptance and Android device/JVM builds were not run: no product UI or
  Android code changed; local Android SDK/adb and modern JDK were unavailable.
- Docker/MySQL/PostgreSQL validation and a full all-repository Node run were not performed.
- No first-party generation cutover, Prompt Compiler, Runtime UI, generateTask deletion,
  second Store/Library/Graph, or A6/A8 replacement-gate edits.
- Existing ST senders were not imported because they are not yet audited explicit-config
  Native adapters. This phase supplies the port/adapter path and fixtures; P4 owns cutover.

Next: P3 Request Context & Prompt Compiler only, after explicit user continuation.

For future UI changes, the user's Playwright desktop/mobile interaction and screenshot
self-review requirement is recorded in NEXT.md. P2 did not change frontend/UI files.
