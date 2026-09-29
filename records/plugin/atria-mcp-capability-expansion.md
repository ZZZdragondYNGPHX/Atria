# Atria MCP Capability Expansion — Implementation Record

Task ID: `plugin/atria-mcp-capability-expansion`  
Primary Workspace: `plugin`  
Approved Plan: `plans/plugin/atria-mcp-capability-expansion.md`  
Plan status: **Approved Implementation Plan v1.1 — Post-Frontend-Refactor Revalidated**

## Phase 1 — MCP Kernel / Repository Observation

Status: **Complete; pushed; stopped at Phase 1 boundary** (2026-09-29).

### Checkpoints and execution boundary

- Start plugin HEAD: `c125b2e7b63ed035a0a253c4036cbdb6bd273225`.
- End / tested plugin HEAD: `8cf6275239860a915d2444d62b05019d8674a6d5`.
- Product main baseline: `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`.
- Start docs HEAD: `708757c0a15cacac2f94bc648f98bb55d113274c`.
- Remote main/plugin/docs fetched and checked before work; all matched the supplied audit checkpoint. Rechecked before push; no concurrent changes.
- Latest plugin AGENTS, complete Governance, approved Plan and HANDOFF slot checked. No live HANDOFF existed; created it for this task. Created this Record when implementation began, then updated it at phase completion.
- Reused clean existing plugin/docs worktrees. Plugin worktree was detached at the baseline and was attached to the tracking `plugin` branch. docs fast-forwarded to the verified remote HEAD.
- Implementation changed only `plugin:atria-mcp/`. No product source changes, no `feat/mcp-development-authority`, no main merge into plugin, no Phase 2 implementation. The caller's existing product working tree remained clean and on its existing branch.

### Delivered

- Package version 0.2.0 and exact 18-tool registration; strict input schemas reject unexpected legacy fields. No per-domain public tools or legacy callable aliases.
- `ActionRegistry`: versioned descriptor metadata, input/output JSON schemas, domain/risk/search/detail discovery, immutable descriptor copies and duplicate-ID rejection. No product actions registered yet.
- `PolicyCeiling`: exact action-ID snapshot; future registrations do not inherit a historical grant. Default READ-oriented. This is eligibility representation, not approval.
- Four risk executors: exact risk matching, availability/ceiling/schema checks and fail-closed later-phase guards/side effects/authorization. Real product mutation remains disabled even with a programmatically broader ceiling.
- Ephemeral, bounded, redacted Receipt Store: MCP instance and receipt identity, TTL, eviction, detached reads and process-close cleanup. No product persistence, lease minting or trusted approval behavior.
- `atri_repo`: repository-wide tracked tree/read/literal search and safe non-ignored untracked development reads; line/hash/category/pagination evidence.
- `atri_git`: status, working/staged/base-to-ref diff, log, exact-file show and blame. Fixed subprocess arguments; external diff/textconv disabled; bounded output/time; only regular historical blobs. Status distinguishes Git index/worktree/untracked codes.
- `atri_artifact`: fixed-root list/read/search/image/inspect with node/depth/byte limits. Image output supports PNG/JPEG/WebP signatures; binary inspection returns bounded identity/hash metadata, not raw archives or execution.
- Independent `RepositoryAccessPolicy`: tracked/untracked/artifact classification, product/user data and dependency/cache exclusions, sensitive paths, traversal/ADS/symlink/junction protection. Explicit extra dataRoot exclusion; YAML parsing of current/historical/index root runtime config with fail-closed malformed input and retained exclusions.
- Sensitive-content filtering is applied before pagination/truncation. Private keys are denied; ordinary structured/free-text credentials redacted; sensitive multiline content suppressed. Git diff checks full relevant files before showing hunks, so secret continuations cannot escape when their header is outside context.
- Consolidated `atri_api` supports Native discovery/detail/GET only. Removed the write switch, model confirmation fields and old browser mutation implementation; Phase 1 browser interaction allows scrolling only.
- Existing browser observation, authenticated GET/reference, images, frames and diagnostics preserved. Diagnostic snapshot explicitly marks later-phase product evidence unavailable. Runtime/source match is `UNVERIFIABLE`.
- README, guide/resource/prompt, example configuration and verifier migrated to the new surface. The optional real-product verifier is observation-only for Phase 1.

### Frozen audit conclusions preserved

- Native Frontend Runtime v3 already exists in main; do not create a second frontend or Studio authority.
- Reuse canonical `serverBootId`; the standalone `runtimeBootId` design is cancelled.
- Phase 2 must recheck then-current main for direct current-runtime identity and startup source fingerprint/full revision binding before deciding whether product code is needed.
- Frontend Host Bridge and MCP Browser Capability Bridge are distinct. The latter is later limited to allowlisted Memory / Orchestrator / selected game-runtime APIs without stronger server authority.
- Build remains the semantic action namespace; Native Studio remains owning authority. Reuse Source Graph, diagnostics, frontend.patch, formal evaluation, Preview and Experience Epoch.
- Committed Conversation/Timeline is immutable. GenerationProjection remains ephemeral presentation.
- v0.2.0 public surface remains exactly 18 tools. Semantic expansion belongs in the Registry.

### Actual validation and CI

Environment: Windows, Node.js v24.18.0, npm 11.16.0. Browser fixture used installed Microsoft Edge through `ATRIA_TEST_BROWSER_CHANNEL=msedge`.

- `npm run check`: passed (all eight source modules).
- `npm test`: **19/19 passed**, no skips. Covers exact public surface and strict schemas, legacy rejection, tracked/untracked reads, Git operations, independent path/content policy, current/historical/index dataRoot exclusions, symlink/junction and historical symlink denial, multiline diff leakage, bounded artifacts and cursors, kernel and receipt infrastructure, stdio and actual browser fixture.
- `npm run test:integration`: 2/2 passed during integration migration; both tests also passed in the final 19-test suite.
- `node --check scripts/verify-atria.js`: passed.
- `git diff --check` and staged diff check: passed.
- Initial integration attempt failed because the bundled Playwright Chromium executable was absent. Explicitly selected installed Edge and reran successfully; no browser was downloaded and no missing-browser test was skipped.
- Added exact `yaml@2.9.1` for safe config/dataRoot parsing. npm installation audit reported zero vulnerabilities; this is not a separate security certification.
- No independent lint or TypeScript/typecheck script exists. Schema checks are runtime Zod and MCP protocol tests.
- Real Atria `npm run test:atria`, product build, Android/device checks, real Studio/Session flows, real runtime provenance and human UI visual review were **not run**. Fixture browser execution is not claimed as real product UI verification.
- Plugin commit pushed to `origin/plugin`. At this HEAD, GitHub check-runs returned `total_count: 0`; combined commit status returned `state: pending, total_count: 0`. The plugin branch has no tracked `.github` workflow. **No remote CI pass is claimed.**

### Limits and next checkpoint

- Phase 1 provides kernel infrastructure; product semantic action registry is empty and all product side effects remain disabled. Trusted approval/Lease behavior belongs to Phase 4.
- Arbitrary unlabelled secrets cannot be identified reliably from free text; use a controlled development checkout. Explicit custom/CLI data roots must be supplied via `--data-root` if not represented in root runtime config. All known sensitive/product-data exclusions remain independent of gitignore.
- Artifact inspect is identity-only (size/hash/extension), not archive manifest validation. Fixed roots and limits are documented in the plugin README.
- No Source ↔ Runtime ↔ Browser match is established yet. Do not claim source-current verification from Phase 1 screenshots.
- Approved Plan is unchanged. Next authorized stage in a new conversation is Phase 2 only; first fetch/recheck remote refs and revalidate current main authorities. HANDOFF retains the exact continuation prompt.

## Phase 2 — Runtime Provenance / Fixed Capability Adapters

Status: **Complete; pushed; stopped before Phase 3** (2026-09-29).

### Actual checkpoints and revalidation

- Start plugin: `8cf6275239860a915d2444d62b05019d8674a6d5`.
- End / tested plugin: `038f061223684c9e36ad3340dd08d8a295d625bf` (pushed to `origin/plugin`).
- Product main baseline: `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`, unchanged by this phase.
- Product auxiliary branch / tested HEAD: `feat/mcp-development-authority@46d717dd177d2825d420ab21d53f13968f645afe` (pushed; not merged into main).
- Start docs: `5a3c2204b55187ca0f2e04d973eb89f5981006eb`. This Record and live HANDOFF are updated together; use actual remote docs HEAD on resume.
- Initial fetch confirmed the supplied main/plugin checkpoints; main, plugin and docs worktrees were clean. Read current plugin AGENTS, full Governance, task HANDOFF, approved Plan and this Record. HANDOFF still belonged to this task and was preserved.
- Rechecked actual main `/version`, startup-store/startup-timing, diagnostics, Native Session/Studio/Frontend and the first-party browser capability APIs. Canonical `serverBootId` and process start existed, but no direct current identity bound them to full revision and startup source-content identity. Only after confirming that gap, created a managed independent product worktree from the verified main and selected the specified feature branch.
- Reused existing plugin/docs worktrees; caller's original product checkout and branch remained unchanged. No reference branch access, no main-to-plugin merge, no product source copied into plugin. Product branch is intentionally retained for later phases, per the multi-stage Plan.

### Delivered

- Product: one `GET /api/diagnostics/runtime-identity` on the existing private diagnostics mount, with `Cache-Control: private, no-store`. Launcher captures identity once before importing server-main. Requests return detached snapshots and never recompute startup source bytes.
- Identity reuses canonical `serverBootId` and startup-store process timestamp, adds app version, full revision/branch, hashed workspace identity and versioned source fingerprint/uncertainty. Product responses carry `X-Atria-Server-Boot-Id` so MCP can bind the actually loaded main document, not merely a subsequent API request. No second boot ID or new Frontend/Studio authority.
- `atria-source-v1`: full HEAD plus sorted path/index-mode/raw-content-hash manifest of tracked source in explicit runtime source roots; bounded double scan, regular-file/junction checks, detectable ignored and non-ignored runtime untracked uncertainty. Product and plugin independently implement the wire protocol; MCP never imports or executes configured checkout code. Raw CRLF/LF differences intentionally change identity. Fingerprint is source evidence, not identity of dependencies, runtime config or user data.
- Plugin compares `EXACT`, `SOURCE_CHANGED_SINCE_RUNTIME_START`, `CONTENT_MATCH_DIFFERENT_WORKSPACE`, `DIFFERENT_REVISION`, `UNVERIFIABLE`. Older/unavailable/unauthenticated identity and incomplete evidence remain unverifiable without disabling observation. Status can fetch identity without starting a browser.
- Browser open/reload binds document response boot ID to current authenticated runtime identity. Status cannot silently recapture it. Server restart gives `STALE`; reload/open gives `CURRENT`. Real main-document navigation invalidates binding; same-document SPA history/hash navigation preserves it. Also fixed empty transient iframe URL handling found by the new browser fixture.
- Status, browser evidence and screenshot text carry provenance. Native GET responses include their own boot ID/timestamp. Screenshot capture reports scoped identity changes across the capture interval; unmeasured intervals are explicitly labelled. Source match is never a substitute for scoped authoring proof.
- Passive, bounded projection of fixed existing Native Frontend/Studio responses keeps Experience Session/Epoch/revision/descriptor identity separate from Project/baseRevision/Workspace/normalized operations fingerprint/evaluation status/Preview/PackageVersion/entryPoint/package hash. Preview UI observation must match the same Preview and PackageVersion. These are last-observed authority responses, not a live scope freshness assertion; unavailable fields stay unavailable. No arbitrary Host Bridge dispatch or second Preview/evaluation/Source Graph implementation.
- Internal fixed browser adapters: `memory.schema.scope` → `memory-graph.getSchemaScopeInfo`; `agents.presets.list` → `orchestrator.listWorkspacePresets`; `game.loaded.identity` → browser-loaded `game-runtime.getPackageState` projection. Strict input/output schemas, READ risk, availability rules, literal capability/method accesses, output projection/redaction, size/time limits and browser/Experience provenance guards. No model-provided JS/module/window/property-chain/capability/method dispatch; no vector recall, model calls or mutation.
- Fixed adapters are infrastructure only; Registry remains empty until Phase 3 owns full READ registration. Exactly 18 public tools, GET-only `atri_api`, no legacy aliases/confirm/write switch, no Lease or approval implementation. Committed Timeline and ephemeral GenerationProjection boundary unchanged.
- Updated plugin README/guide and opt-in real-product verifier for the current phase, including clean disposable-checkout source-change and separate-checkout revision comparison options.

### Actual validation

Environment: Windows, Node.js v24.18.0, npm 11.16.0, installed Microsoft Edge via `ATRIA_TEST_BROWSER_CHANNEL=msedge`.

- Plugin final HEAD: `npm test` **24/24 passed**, zero skips, including exact 18-tool MCP stdio contract, Phase 1 regression coverage, fingerprints/revisions/untracked uncertainty, fixed dispatch/schema/redaction checks, independent Epoch/Preview comparisons, passive response capture bounds and real Edge fixture stale/reload/SPA-history behavior.
- `npm run check`: all ten source modules passed. `node --check scripts/verify-atria.js`, working and staged `git diff --check`: passed. Final provenance/integration targeted run also passed 7/7 before the final all-test run.
- Product: Jest `logging/source-identity.test.js`, `logging/diagnostics-api.test.js`, `logging/diagnostics-mounting.test.js`, `logging/startup-store.test.js`: **4 suites, 17/17 tests passed**. Covers source mutation/staging/deletion/untracked/ignored/junction behavior, canonical identity fallback, private diagnostics integration and startup regressions.
- Product targeted ESLint passed for `server.js`, `src/server-main.js`, `src/endpoints/diagnostics.js`, `src/logging/source-identity.js`, `src/logging/runtime-identity.js`.
- Real `npm run test:atria` passed at final plugin `038f061223684c9e36ad3340dd08d8a295d625bf` against product `46d717dd177d2825d420ab21d53f13968f645afe`, with fresh disposable data and a real Edge page. Verified Source/Server `EXACT`, loaded-page `CURRENT`, tracked package.json temporary whitespace change → `SOURCE_CHANGED_SINCE_RUNTIME_START` while startup fingerprint remained immutable, restore → `EXACT`, independent existing product checkout at `cfe7ee99a` → `DIFFERENT_REVISION`, actual server restart with page retained → `STALE`, reload → `CURRENT`.
- Final real startup fingerprint: `0b77352e33f8bbd6db79558b34f2f925cb79ff04eb40200ac42caf71ce82d05f`; app `2.7.0`. Boot changed from `b0ea665f-11cc-45c0-bfce-bac77b8e260b` to `7cb68509-ae07-4eb1-bc07-d30f388f31c1` with the same startup source fingerprint. These are historical test evidence, not current runtime state.
- Real product returned 163 discovered routes, 23 authoring references and 200 for Studio project observation. Required frontend core bundle 200; real product webpack startup build succeeded after dependency repair. Captured desktop and 390×844 mobile screenshots; visually inspected the desktop shell/onboarding. No onboarding action or product data mutation was sent through MCP. Final local ignored evidence: `atria-mcp/.artifacts/atria-1790693175148/`; no runtime data/logs/screenshots/binaries committed.
- Expected diagnostic noise during deliberate restart includes websocket-ticket connection refusals; startup timing request aborts also occurred. This is not a zero-error browser session or a complete UI flow test.

### Failures resolved and limits

- Initial regression test expected the Phase 1 unavailable placeholder; migrated the assertion to the new provenance document.
- Browser fixture exposed a transient empty iframe URL; it now fails filtering safely rather than throwing.
- First real provenance run passed identity assertions but its UI had 404 bundles because the reused dependency tree lacked QuickJS packages. This was not accepted as healthy product UI evidence. Removed only the verified dependency junction and ran isolated `npm ci --ignore-scripts --no-audit --no-fund` in the product worktree (924 packages); did not modify the caller's dependencies or package manifests. The verifier now requires the core bundle to return 200.
- Healthy product startup then exposed SPA history navigation invalidating the document binding. Corrected invalidation to actual main-document requests, added a browser regression test, and reran final real integration successfully.
- Missing identity, untracked uncertainty, scope Epoch/Preview changes and fixed adapters have fixture/unit coverage. Real active Session Epoch invalidation, real Studio Workspace/evaluation/Preview binding and real Memory/Orchestrator product scenarios have **not** been exercised. They remain integration work for the owning later phases; this phase does not claim full Native Frontend v3 verification.
- No full product Jest suite, Android/device checks, deployment or final main integration performed. No Phase 3 implementation or Phase 4 mutation/approval work begun. Approved Plan v1.1 remains unchanged.

### Remote state / next checkpoint

- Plugin and product feature commits pushed. GitHub queried for both exact HEADs: **zero check-runs, zero commit statuses, combined state `pending`**. No remote CI pass claimed. Product workflows do not automatically run on this feature push; no PR or manual broad workflow was created for this phase.
- Main remains at the verified baseline. Product feature is not merged or deleted at this phase boundary. Preserve/reuse it for later task stages.
- Same Record and task-owned live HANDOFF updated. Next stage is **Phase 3 — Full Read Authority**, only on a new explicit continuation. Fetch all real refs before resuming; keep the exact 18-tool surface and preference for stronger server authority.
