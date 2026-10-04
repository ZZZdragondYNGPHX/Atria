# Atria MCP Capability Expansion — Implementation Record

Task ID: `plugin/atria-mcp-capability-expansion`  
Primary Workspace: `plugin`  
Approved Plan: `plans/plugin/atria-mcp-capability-expansion/index.md`  
Plan status: **Approved Implementation Plan v1.1 — Post-Frontend-Refactor Revalidated**

Latest state: the 2026-10-04 integration checkpoint below supersedes the older unmerged-Core checkpoint. Broader paid-provider and interactive-client acceptance is still open.

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

## Phase 3 — Full Read Authority

Status: **Complete; pushed; stopped before Phase 4** (2026-09-29).

### Actual checkpoints

- Start plugin: `038f061223684c9e36ad3340dd08d8a295d625bf`; end / real-integration-tested plugin: `4d8cbb9da376b3417f47e6f3e23d9eba09b1c1ae`, pushed.
- Start product feature: `46d717dd177d2825d420ab21d53f13968f645afe`; end / real-integration-tested `feat/mcp-development-authority`: `defeaabacd918966f3fda6f3be3dcb2a789deebd`, pushed, retained, not merged.
- Main remains `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`.
- Docs start: `55690046979aea005391595bb265932a5c3f161d`; use real latest remote docs HEAD on resume.
- Initial fetch/dirty checks confirmed supplied refs and clean existing plugin/docs/product worktrees. Read current AGENTS, full Governance, task-owned HANDOFF, Plan and this Record. Reused worktrees; no main-to-plugin merge, reference access or caller-checkout changes. Re-fetched before push; no concurrent ref changes.

### Delivered and authority decisions

- **102 READ actions**: 76 fixed HTTP and 26 fixed browser adapters. Exactly 18 public tools. Descriptors provide schemas, owning authority, risk, external effects and runtime prerequisites. Exact-ID Policy Ceiling is created after registration. No approval/Lease/mutation implementation.
- Native reads cover Session inventory/detail/snapshot/saves/health/runtime, immutable Timeline/history/branches, generation status; Build Project/source/revision/history/diff/resource closure/validation/preflight, Native Frontend v3 Source Graph/diagnostics and existing Preview compiled identity; Library inventory/exact/graph/references/Used By/delete-safety/bundle inspection/fork preflight; Work/version/dependencies/resource setup; Generation configuration/resources/presets/retrieval, Connections/Models/Routes, opaque Secret references, scoped Settings, Diagnostics and ProjectAgent task/context.
- Reviewed POST-shaped reads use a private fixed transport with actual CSRF/auth/ownership/admin checks, blocked redirects, response limits, and per-response `serverBootId`/timestamp. `atri_api` remains discovered Native GET-only; no model-selectable method/path/capability/JS dispatch.
- Outputs are redacted before bounded paging; fragments include content hashes and cannot claim an atomic snapshot. Studio source base64 is decoded before filtering; non-UTF-8 output is metadata-only. Bundle inspection/preflight keeps payloads internal and returns references/dependencies/conflicts.
- `connection.probe` resolves an existing ConnectionProfile ID through Native Generation; no model-supplied credentials or arbitrary endpoint. Secret inventory projects only opaque ID/label. Probe/vector/recall declare network/possible-cost effects separately from READ risk; snapshots do not invoke them automatically.
- High-level snapshot composes source/server/browser identity, browser failures, modules/logs/incidents/startup/provenance and independent last-observed Experience/Preview evidence. Missing/permission-denied evidence remains explicit. Reads are not atomic and do not prove current exact scoped identity.
- Fixed browser reads cover Memory scope/schema/nodes/edges/candidates/briefs/expansion/keyword/vector/name/compaction candidates/injection/last projection/observation recall; Orchestrator preset inventory/bindings/run/graph/timeline/model/tool/recall/diagnostics/token/cost/checkpoints; browser-loaded game identity/LLM status/presentation. Persisted preset/binding reads prefer SettingsRepo. LLM status is explicitly not GenerationProjection or committed Conversation.
- Browser dispatch remains literal with strict inputs, bounded/redacted/paged output, Set-to-array injection projection and document/Session/branch/observed Experience change checks. Last-observed scoped evidence never becomes a current exact claim. Non-empty Memory reads require an already loaded owning store.

### Minimal product gaps filled on the retained feature

- Legacy Settings `/get` can seed/migrate state. Added authenticated pure `/api/settings/observe` over SettingsRepo: scoped catalog/get/search, no seeding, secret/generation-configuration exclusions, root-dump rejection and path/type-only search.
- Exposed existing Native Library `getExact` through Studio HTTP; no new Library store or resolution logic.
- Exposed existing Orchestrator `workspaceRunView(getCurrentRun())`, rejecting stale requested run IDs; no second run store or execution mechanism.
- Existing Memory write-session/source reconciliation/recall access accounting can persist changes. Added loaded-store read factory/last projection and observation recall through existing lifecycle. Read-only snapshots skip persistence/cache publication/access accounting while preserving source guards; normal write/recall paths retain their behavior.
- Canonical `serverBootId` and startup identity are preserved. No new Frontend Host Bridge, Source Graph, diagnostics compiler, frontend.patch, evaluation, Preview or Experience Epoch authority.

### Actual verification

Environment: Windows, Node.js v24.18.0, installed Edge via `ATRIA_TEST_BROWSER_CHANNEL=msedge`.

- Plugin full suite **30/30**, zero skips. After final naming/metadata/scoped-check adjustments, affected read-authority/unit suites **12/12**. Includes exact 18-tool stdio, fixed risk/path/CSRF, opaque references, decode-before-redaction, paging, injection Sets, real Edge scope drift and earlier repository/provenance regressions.
- `npm run check`: all 11 modules; verifier syntax and working/staged diff checks passed.
- Product targeted Jest **5 suites / 124 tests**: settings-observation, native/studio-resource-http, memory-graph/source-lifecycle, memory-graph/read-api, orchestrator/run-state-store. New coverage proves pure Settings, authenticated exact Library delegation and non-persisting observation recall with stale-source rejection. Targeted ESLint passed on all seven touched implementation modules; diff checks passed.
- Real disposable Atria + Edge READ integration passed first against staged implementation and then against the exact final plugin/product HEADs above with clean product checkout. Final run discovered 164 routes/23 references; frontend core bundle returned 200.
- Separate test setup created disposable Project/Package/Session/Preview through normal product APIs. MCP only read them: Studio source/revision/history/closure/validation/preflight, Source Graph, stale baseRevision rejection (409), exact compiled Preview, PackageVersion/Library exact, Session detail/Timeline/history/branches/saves/runtime. Project revision remained unchanged after READ.
- Real browser reads succeeded for memory.schema.scope, memory.injection, memory.recall.last, agents.presets.list, agents.run.get, agents.checkpoints, game.loaded.identity and game.llm.status. These were **idle/empty** results: global scope, empty injection/checkpoints, null recall, built-in presets, idle run/game. They do not prove populated Memory or executing Agent scenarios.
- Final Source/Server `EXACT`; actual restart -> browser `STALE`; reload -> `CURRENT`. Source fingerprint `feb27484b24cc365c26da539888c5aeeb081ed0e79fa5bce7a6c1c5a56698f38`. Boot changed from `7227a3c7-8a23-43ad-b67d-8b85ceeaab64` to `513401d3-dc87-4447-9736-ca8d2ec1bed1`. Historical evidence only.
- Captured desktop 1440×1000 and narrow 390×844 shell evidence, not a rendered active Preview/Experience flow. Final ignored evidence: `atria-mcp/.artifacts/atria-1790694878994/`. Owned runtime/browser/temp dataRoot/config cleaned up; no data/logs/screenshots/generated bundles committed. Expected restart websocket failures remain; no zero-error UI claim.

### Remote CI, limits and next checkpoint

- Both implementation HEADs pushed. Each has **0 GitHub check-runs, 0 commit statuses**, combined `pending`. **No CI pass claimed.** No PR/manual broad workflow, full product suite or Android/device validation.
- Live paid-provider probe/vector/recall, populated Memory graph/injection, executing Agent traces, active Experience Epoch revocation and rendered Workspace/evaluation/Preview binding remain unverified end-to-end. Current evidence distinguishes product/unit/fixture coverage from real server READ and idle browser flows.
- Missing older endpoints/capabilities fail without storage fallback. Cross-call paging may change; compare hashes. Unlabelled secrets in free text retain the documented best-effort redaction limitation.
- Plan v1.1 unchanged. Same Record/live HANDOFF updated; product feature retained separately from main. Next stage only on explicit continuation: **Phase 4 — Authorization / Receipts / Safe Mutations**, stopping before Phase 5.

## Phase 4 — Authorization / Receipts / Safe Mutations

Status: **Complete; pushed; stopped before Phase 5** (2026-09-30 Asia/Shanghai).

### Actual checkpoints

- Start plugin: `4d8cbb9da376b3417f47e6f3e23d9eba09b1c1ae`; final / real-integration-tested plugin: `f420640d299ceb3fda48a9f49c85f2b4c0c6cc0e`, pushed.
- Plugin implementation commits: `f56ce880d571dbc479c739ac64235642e1b2e1b4`, `b5ba42cccd59500cfd4314ed913bf43f9524b936`, `f420640d299ceb3fda48a9f49c85f2b4c0c6cc0e`.
- Start product: `defeaabacd918966f3fda6f3be3dcb2a789deebd`; final / real-integration-tested `feat/mcp-development-authority@da284bc51db1f10cfb82fe7444b2f1087a3a9a6e`, pushed, retained, not merged.
- Main unchanged: `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`. Docs start: `e8bf4dbae3b28dd1d0d150812138d2d5d7bd5c23`; use actual latest docs HEAD on resume.
- Fetched and verified clean existing plugin/docs/product worktrees and supplied checkpoints. Read current plugin AGENTS, full Governance, task-owned HANDOFF, frozen Plan v1.1 and this Record. Reused worktrees; no main-to-plugin merge, reference access or original-checkout changes. Final fetch confirmed docs live slot still belongs to this task.

### Authorization, Lease and Receipt

- Registry now has **136 actions: 105 READ / 25 MUTATE / 6 INTERACT / 0 DESTRUCTIVE**. Exactly 18 public tools remain. Three new READ helpers prepare/inspect Build changes and inspect the loaded Memory mutation target.
- Startup `--policy` accepts only versioned exact action IDs. Default remains READ. Runtime availability and risk/schema checks remain separate from the policy ceiling.
- Trusted approval uses MCP form elicitation, presenting exact normalized input, target, authority, risk, effects and provenance. Explicit authorization is false by default; unsupported clients fail closed. Model-provided input is never approval. No legacy aliases/confirm/allow-writes, arbitrary JS/capability dispatch or generic Native write escape hatch; `atri_api` remains Native GET-only.
- Private server-minted leases bind MCP instance, exact action/risk/payload/target/serverBootId, expire after five minutes and have explicit 1–20 uses. Invalid/expired/exhausted leases fail rather than silently reapprove. Execution is serialized; guards and provenance run before and after approval, cancellation is honored, and a use is consumed before execution.
- Ephemeral bounded/redacted receipts record succeeded/rejected/indeterminate outcomes, before/after evidence, effects and recovery. Uncertain transport/partial composite execution is not automatically retried or rolled back. Server-owned receipt/created-object identity cannot be supplied by the model. Receipt retention is one hour / at most 100 entries.
- Source/Server/Browser evidence stays independent from scoped Experience/Project/Workspace/Preview evidence. Last-observed is explicitly not current exact proof.

### Controlled operations and owning authority

- Session rename/save/restore and Chat branch fork/switch/restart/remove-active use existing revision/branch authority and retain historical committed Timeline. Historical revision, message and branch membership are checked before approval. Send uses the owning detached turn scheduler; regenerate/reenter compose a branch boundary and generation, reporting partial completion as indeterminate. GenerationProjection remains ephemeral.
- Work start binds exact version/entrypoint and resource setup. Build Project create checks absence. Build prepare/inspect accepts a fixed Workspace operation schema; evaluate/frontend.evaluate reuse formal Native Studio evaluation and its temporary-change restoration.
- Build apply requires this MCP instance's successful evaluation receipt, matching baseRevision, Workspace, normalized operations, inspected changes, current Preview/version and boot. Evaluation receipts include validation/hash and Preview descriptor identity. No ad-hoc compiler, Source Graph, frontend.patch or Preview authority was introduced. Preview create/close and isolated recorded/mock simulation use existing services.
- Settings patch is restricted to eight ordinary scalar keys with test/replace concurrency. Runtime parameters use existing prompt-controls; Connection/Model/Route updates use fixed config authority, opaque Secret references and expected fingerprints. Library World/Knowledge create immutable revisions, including the nullable initial revision.
- Memory node create/edit, relation upsert and compact use literal fixed browser calls and the already loaded owning graph. Guards bind current document, same-origin/current boot, Session/branch and canonical graph hash; the product guarded session rechecks under its write queue. Native relation directions are outgoing/incoming/bidirectional. No Frontend Host Bridge handle or arbitrary browser code is exposed.
- Minimal product additions: canonical boot mismatch middleware and `mutationGuards:1`; authenticated detached `/turn/start` through existing scheduler; optional config If-Match verified in serialized persistence; optional guarded Memory sessions with isolated drafts, source-ticket checks and queued-commit rejection/rollback. Existing callers remain compatible. Native server remains preferred; no parallel storage/authority was created.

### Actual validation and resolved failures

- Plugin full suite **37/37**, zero skips, after the main authorization/receipt implementation. Final affected authorization suite **8/8** after the last Memory enum and Session target-preflight changes. The full suite was not rerun after adding that eighth test; no 38/38 claim.
- Coverage includes exact 18-tool stdio, missing/declined/cancelled approvals, guard/provenance drift, lease instance/payload/expiry/use binding, concurrency, receipt ownership, uncertain results, forged/stale Build evaluation, invalid Session targets before approval, and real Edge Memory fixtures with stale graph/boot rejection.
- Plugin 13-module syntax check, verifier syntax, working/staged diff checks passed.
- Product **6 targeted suites / 91 tests** passed: model-prompt-runtime-persistence, memory-graph/guarded-session, memory-graph/source-lifecycle, native/frontend-authoring, model-prompt-runtime-p4 and logging/source-identity. Targeted ESLint on five implementation files and three test files plus diff checks passed.
- Initial disposable integration caught null title versus empty-string concurrency mismatch; corrected the nullable Session contract. Final review corrected Memory relation direction to the native enum and added explicit historical Session target checks. A targeted test invocation without the Edge environment failed because bundled Chromium was absent; explicit installed msedge rerun passed without downloading a browser.

### Final exact-HEAD real integration

- `npm run test:atria` passed against the final plugin/product HEADs above, using installed Edge and fresh disposable Atria data/config; product tracked tree was clean. 165 routes discovered, frontend core bundle available, Source/Server EXACT.
- Fourteen successful MCP operation receipts: build.frontend.evaluate, build.change.apply, build.preview.close, build.simulate, session.rename, session.save, chat.branch.fork, session.restore, work.start, settings.patch, two library.world.revision.create and two connection.update.
- Real Source Graph-selected frontend.patch evaluation restored the original source; apply changed the exact intended text; stale apply and mismatched server boot were rejected. Existing Session/Library/Studio READ checks were preserved.
- Approval roundtrip used real stdio MCP form elicitation with deterministic acceptance by the trusted test client. This proves protocol execution, **not human approval UX in Codex/Claude Code**. Connection configuration used a non-contacted example.invalid endpoint and an opaque reference; no paid provider call.
- Eight browser READs succeeded for Memory scope/injection/last recall, Orchestrator presets/idle run/checkpoints and game identity/status. These remain **idle/empty** evidence. Populated Memory mutation is covered by product tests and a real-browser fixture, not a populated real Atria end-to-end flow.
- Source fingerprint `5dd6413fc5c5420439c3e2de3d2a4d7c00341883915fc74a41c4669891f0084e`; actual server restart changed boot `bc0d5d6d-d21a-4e37-9993-0453a8771596` to `8946112b-45fd-41cc-8f81-459d5e9c7891`; retained page became STALE, reload CURRENT. Historical evidence only. Source-change/different-checkout opt-in checks were not repeated in Phase 4.
- Desktop 1440×1000 and narrow 390×844 shell captures retained under ignored `atria-mcp/.artifacts/atria-1790698052908/`. Owned runtime/browser/temp data/config were cleaned up. No test data, logs, screenshots or generated binaries committed. Expected restart websocket failures/startup timing aborts remain; no zero-error UI claim.

### CI, limits and next checkpoint

- Final plugin and product HEADs each have **0 GitHub check-runs / 0 commit statuses**, combined state pending. **No CI pass claimed.** No PR, main merge, full product suite or Android/device validation.
- Live paid-provider send/regenerate/reenter/probe/vector/recall, populated real Memory, executing Agent, active Experience Epoch changes, rendered Workspace/evaluation/Preview UI and actual client human approval UX remain unverified end-to-end. API/fixture/unit evidence must not be upgraded to these claims.
- Approved Plan v1.1 unchanged. Same Record and task-owned live HANDOFF refreshed. Product feature stays separate. Phase 5 has not begun.
- Next explicit continuation: **Phase 5 — High-risk Operations / Package / Agent Delegation** only; preserve Phase 4 authorization/receipt/guard authority, verify destructive scope and Agent escalation boundaries, persist the same Record/HANDOFF, and stop before Phase 6.


## Phase 5 — High-risk Operations / Package / Agent Delegation

Status: **Complete; pushed; stopped before Phase 6** (2026-09-30 Asia/Shanghai).

### Actual checkpoints

- Start plugin: `f420640d299ceb3fda48a9f49c85f2b4c0c6cc0e`; end plugin: `1dfcc35f673f3b4db031355ab061558ca9c1569a`, pushed.
- Start product: `da284bc51db1f10cfb82fe7444b2f1087a3a9a6e`; end `feat/mcp-development-authority`: `b2709b5af2664b05f6bd32a05a06097a3e98bd6f`, pushed, retained, not merged.
- Main remains `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`. Docs start: `5dd13e2d1a9e6f657fe6b0b05f098ae37b4a1780`.
- Fetched first, verified clean plugin/product/docs worktrees and current refs, read plugin AGENTS, full Governance, task-owned HANDOFF, Plan and same Record. Reused all existing worktrees; no reference reads, main-to-plugin merge or original checkout edits. Re-fetch before push confirmed unchanged docs live slot and base refs.

### Destructive authorization and cleanup

- Registry: **152 actions = 109 READ / 27 MUTATE / 8 INTERACT / 8 DESTRUCTIVE**. Exactly 18 public tools; canonical `serverBootId`, Native GET-only `atri_api`, fixed browser calls and default READ ceiling retained.
- DESTRUCTIVE approvals have exactly one use. Multi-use destructive requests fail closed. Receipt deletion evidence is now populated. There is no broader repeatable destructive lease or natural-language cleanup predicate.
- Added exact Session deletion, revision-guarded Studio Project deletion, Work deletion with dependent Session checks, and formal Library revision delete-safety/deletion. Work reference blockers remain enforced by the owning transaction; no force or separate PackageVersion physical-delete action.
- Session/Project `.owned` cleanup additionally requires a successful current-instance creating receipt, same server boot, exact object ID and original creation revision. Creation receipts now record that revision. Changed objects use ordinary one-shot deletion with fresh review; old receipts lacking the creation revision cannot authorize owned cleanup.
- Memory node/relation deletion uses the existing loaded graph fingerprint/source-guarded write session and DESTRUCTIVE executor. No generic Memory mutation batch or arbitrary capability method dispatch.
- Minimal product changes add optional expected Session revision and Work base-version checks inside existing owning transactions; Work service uses the existing package write queue. Runtime identity declares `highRiskGuards:1`. Older unguarded product runtimes fail closed. Existing callers remain compatible.

### Package artifacts and install

- Instance-owned `.atria` handles capture only safe development artifact roots or a formal Studio build result. Bytes remain internal, at most four handles / 16 MiB each / 15-minute TTL; no filesystem or archive payload is exposed through model-selected generic writes. Studio build retains the ordinary 1 MiB HTTP response bound.
- `package.artifact.inspect -> package.install.preflight -> package.install.review -> package.install` binds archive hash, package/exact version, installed base, permission grants and normalized full preflight (permission/capability diffs and pinned Sessions).
- Review produces a trusted, instance-owned receipt. Install independently requests approval, rereads preflight and requires the same review and base. Product install already rechecks baseVersion within the owning package write queue; reused unchanged. Wrong/expired handles, forged reviews, permission mismatch and base/preflight drift fail before effects.
- PackageVersion immutable semantics and existing product authorization/CSRF boundaries remain intact.

### Explicit Agent delegation

- `agent.delegation.inspect` / `agent.run.start` expose the bounded **delegated-node** mode: one explicitly selected node from a real Workspace preset, through existing `compileWorkspacePreset`, capability intersection, `AgentRegistry`, `AgentRuntime`, Native generation and Orchestrator durable checkpoint store. This does not implicitly execute the full preset graph.
- Envelope contains exact task/preset/node/scope, at most eight fixed Memory create/edit/relation-upsert/compact inputs, step/context/deadline limits. Each operation is usable once. Preset tools and node/product capabilities intersect with exact MCP Policy Ceiling and the parent trusted approval. No deletion, web, arbitrary extension tool, substituted tool arguments or nested Agent authority.
- Internal browser callback is instance/run-nonce/main-frame/document/boot bound. It accepts only an operation index; actual action/input comes from the approved envelope. Child effects re-enter the existing risk executor, revalidate authority, and mint separate receipts. Concurrent/duplicate/unknown operations fail closed. Child uncertainty makes the parent indeterminate and is never automatically retried.
- Parent/child receipt IDs bind run/step/effect attribution. Evidence includes model calls, tool results, Memory effects, provider usage per call and cost when available; unavailable accounting is null. Automatic Memory recall is disabled. Existing durable checkpoints remain product-owned; no parallel execution/persistence engine.
- Bounds are 1–8 steps, 256–16000 context budget and 1–60 seconds. MCP request cancellation invokes live Runtime stop. These are execution bounds, not a guaranteed monetary/token-spend cap; no live paid provider was invoked during verification.

### Actual verification

- Plugin full suite **43/43**, zero skips, including exact 18-tool stdio contract, existing observation/provenance coverage, one-shot deletion, forged/failed/wrong-boot/wrong-object cleanup, Package hash/grants/review/base drift, and delegated policy/once-only boundaries.
- Final affected high-risk suite **5/5** after uncertainty propagation was added. Real Edge bridge fixture proves exact semantic child execution, parent/child attribution, rejection of unknown/replayed indices and forbidden destructive delegation; uncertain child effect produces an indeterminate parent. Real Edge Memory fixture exercises guarded node/relation deletion. This is fixture evidence, not populated live Atria Memory.
- Product initial **6 targeted suites / 35 tests**: native/mcp-high-risk, orchestrator/delegated-run, native/product-service, native/product-http, native/package-build-install, logging/source-identity. After durable checkpoint hookup, affected delegated-run + Memory guarded-session **2 suites / 6 tests** passed. Preset deletion/web privilege escalation, substituted args, replay, product capability denial, Session drift, cancellation and context exhaustion are covered using deterministic injected providers.
- Plugin 15-module syntax check, verifier syntax, targeted product ESLint and working/staged diff checks passed. No full product suite, Android/device check or final integration into main.
- Resolved initial MCP startup failure caused by a Zod transform that cannot become JSON Schema; replaced with explicit duplicate-grant validation. Initial real integration correctly refused EXACT while the new runtime file was untracked; staged the task-owned source and reran successfully rather than weakening provenance.
- Pre-commit real disposable Atria + installed Edge integration passed with **23 successful operation receipts**: prior Phase 4 operations plus Studio Package build, Package review/install, old-review rejection, referenced Work rejection, Library revision deletion, owned Session cleanup, ordinary Session deletion, Work deletion and owned Project create/cleanup. Uses real authenticated HTTP/CSRF and deterministic trusted MCP form elicitation, not human approval UX.

### CI, limits and next checkpoint

- Both final implementation HEADs pushed. Each has **0 check-runs / 0 commit statuses**, combined `pending`. **No CI pass claimed.** Product feature remains separate from main; no PR/merge/deletion performed.
- Phase 5 adds narrowly scoped destructive flows, not every potential destructive action described directionally in the Plan. Library root deletion, arbitrary Agent tools/full-preset graph execution and blanket destructive leases are not exposed; the implemented flows retain owning safety boundaries.
- Real paid-provider Agent/generation/recall, populated real Memory, active Experience Epoch, rendered Workspace/evaluation/Preview UI and actual Codex/Claude human approval UX remain Phase 6 verification obligations. Existing shell captures and deterministic tests must not be upgraded to those claims.
- Final exact-HEAD `npm run test:atria` passed against plugin `1dfcc35f673f3b4db031355ab061558ca9c1569a` and clean product `b2709b5af2664b05f6bd32a05a06097a3e98bd6f`. Discovered 165 routes; all 23 operation receipts succeeded. Source/Server EXACT; actual restart STALE; reload CURRENT. Final ignored evidence: `atria-mcp/.artifacts/atria-1790699829676/`. Owned runtime/browser/disposable data/config were cleaned. Source-change/different-checkout opt-ins were not repeated.
- Desktop 1440×1000 and narrow 390×844 captures remain shell evidence, not active Preview UI proof. The eight real browser Memory/Orchestrator/game READs remain idle/empty. Expected restart websocket diagnostics do not imply zero-error UI acceptance.
- Approved Plan v1.1 unchanged. Same Record/live HANDOFF refreshed with final integration evidence and the Phase 6 continuation prompt. Stopped before Phase 6.

## Phase 6 — Integration / Security / Native Frontend v3 Verification

Status: **Verification checkpoint; acceptance remains open, no final product integration** (2026-09-30 Asia/Shanghai).

### Checkpoints and scope

- Start plugin: `1dfcc35f673f3b4db031355ab061558ca9c1569a`; checkpoint plugin: `fbdc372ee05556394d244ab84dac8457954aa7f9`, pushed.
- Product remains `feat/mcp-development-authority@b2709b5af2664b05f6bd32a05a06097a3e98bd6f`; remote main remains `c936b0aa4c42cf5711f40ae4a00f5fc3432813dc`. No product changes, merge, branch deletion or HANDOFF removal.
- Docs start: `85498fb111a10c97dc00c044175e5acf9c74063e`. Fetched first; plugin/product/docs worktrees clean; read current plugin AGENTS, full Governance, live HANDOFF, approved Plan and same Record. Reused all worktrees. Original checkout remained on its existing frontend branch; local main lag was not mistaken for remote truth. No reference contents accessed.
- No new capability scope: still 152 actions (109 READ / 27 MUTATE / 8 INTERACT / 8 DESTRUCTIVE), exactly 18 public tools, generic Native GET-only. Policy, one-shot destructive, exact boot guards, owned cleanup, Package review and delegated-node restrictions retained.

### Real Memory defect found and fixed

- Populated real Native Memory exposed a false indeterminate result after a successful write. The old post-write comparison required the pre-write revision to stay unchanged, although owning persistence necessarily advances it. In addition, game presentation can temporarily unload during a revision commit; its transient null identity is not the owning Memory scope.
- Fixed adapter now prefers the existing Native Session runtime identity (Session/branch/revision only), fails closed on incomplete active Native identity, and preserves full exact pre-write revision/graph checks. After the owning guarded write, it compares stable Session/branch ownership and records `observedAfterTarget`; this observed revision is not a guarantee that no subsequent same-branch writer has run.
- Rechecks exact `serverBootId` and document generation after the write. Real branch/Session drift or boot/document change still yields indeterminate and requires observation, never automatic retry. No alternate persistence authority or generic JS dispatch added.
- Regression covers normal revision advancement, transient game presentation unload, actual branch drift, server restart during effect, stale graph and previous authorization/delegation boundaries.

### Executed verification

- Plugin full **43/43**, zero skips, before the final Native owning-scope refinement. Final affected authorization + high-risk suites **13/13** after that refinement. Do not claim full 43 reran after the last scope change.
- Final syntax checks passed for 15 source modules and all three verifier scripts; working/staged diff checks passed.
- Product **8 suites / 82 tests**: frontend-bridge, frontend-authoring, frontend-presentation, studio-preview-experience, mcp-high-risk, orchestrator/delegated-run, Memory guarded-session and source-identity. Additional frontend-prose + frontend-conversation **2 suites / 10 tests** passed. This includes GenerationProjection stream/finalize/failure/cancellation separation from committed Conversation, stale Epoch handles, same-save restore revocation and delegated escalation denial. Product code unchanged; no full product suite or Android/device claim.
- Enhanced disposable real Atria + installed Edge integration passed before the final committed-head rerun: 165 routes; Source/Server EXACT, tracked source mutation SOURCE_CHANGED_SINCE_RUNTIME_START, independent checkout DIFFERENT_REVISION, actual restart STALE and reload CURRENT. All 24 stdio semantic receipts succeeded; plus 9 real Memory risk-executor receipts in the separate trusted browser harness. Prior Package, owned cleanup and reference-blocker assertions remained passing.
- Real same-process Experience open -> semantic branch fork -> old-handle `bridge_epoch_stale` -> reopen/close verified. Browser remained CURRENT and serverBootId unchanged; Epoch and server restart remain independent evidence.
- Exact MCP evaluation Preview was fetched and rendered by the real production renderer, with reviewed text asserted and desktop 1440x1000/narrow 390x844 images. The actual product Source Graph editor then created its own formal evaluation/Preview: Project/baseRevision/Workspace/operations fingerprint/Preview/PackageVersion/hash and `uiLoaded` were observed; this distinct Preview was explicitly not substituted for the MCP-reviewed Preview. Source restoration and stale apply guards retained. Screenshots visually inspected; editor labels use actual product localization.
- Loaded real Native Memory, through the existing guarded persistence and MCP risk executor, successfully created two nodes, edited, upserted/deleted a relation, compacted, and deleted all three nodes (9 receipts). Schema/node/graph/keyword/name reads returned real populated evidence. Stale fingerprint rejection exercised. Injection/last-recall reads remain empty without generation; they are not populated injection/recall evidence. Final verifier adds explicit persisted cleanup-after-reload assertions.
- Test-mounted real editor/renderer is distinct from full shell navigation acceptance. Fixed setup JS exists only in the verifier, not the MCP surface. Memory harness approvals are deterministic; 24 stdio approvals likewise use the deterministic trusted test client.
- Final committed-head `npm run test:atria` **passed** against clean plugin `fbdc372ee05556394d244ab84dac8457954aa7f9` and clean product `b2709b5af2664b05f6bd32a05a06097a3e98bd6f`. All 24 stdio + 9 Memory receipts succeeded; keyword/name/node/edge assertions and persisted cleanup-after-reload passed. 165 routes, all Source/Server/Browser source-change/different-revision/restart/reload assertions passed. Same-process Epoch state became STALE while browser stayed CURRENT. Final boot `3478e7e5-90fb-4abe-aa81-d298aa96c950`; restarted boot `73b56b59-efdd-49b8-9353-cff708b2680f`. These are historical evidence, not current runtime identities.
- Final ignored evidence: `atria-mcp/.artifacts/atria-1790701433642/` (summary, native-ui, clients, snapshots, desktop/narrow Preview images, actual editor Preview image, runtime log). Earlier passed enhanced run: `.artifacts/atria-1790701251634/`. Final narrow Preview visually inspected; all owned temporary runtime/data/config/browser/client state cleaned by the passing verifier. Codex only warns that helper PATH aliases cannot be created under a temporary config directory; protocol assertions still passed. No default remote-provider attempt in the final isolated-provider run.

### Actual clients and environment limits

- Real Codex CLI app-server **0.148.0**: isolated configuration and ephemeral protocol session; actual MCP startup, exact 18-tool inventory, executor schemas, `atri_status`, capabilities, Session READ and JPEG image content passed. No model turn sent. Initial isolated client prewarm attempted the default provider and received HTTP 401; this was not a model completion or paid-provider validation. Subsequent runs bind the provider to a local unavailable test address.
- Real Claude Code **2.1.283**: example-shaped isolated configuration and `mcp get` reported Connected. Its CLI health command does not expose tool invocation/schema/image validation; those Claude-specific checks remain open. SDK stdio evidence is not relabelled as Claude execution.
- Current desktop Atria connector was also checked: it is still a Phase 5 READ-only process pointed at the original frontend checkout, with runtime identity unavailable, `productMutationAvailable: false`, and UNVERIFIABLE source/runtime match. It cannot supply human mutation-approval evidence for this disposable feature runtime. Personal client configuration was not edited.
- Actual client human elicitation/decline/accept UX remains unverified. No available configured provider in the disposable runtime; real send/regenerate/reenter/stop, embedding/recall/injection, and live Agent/model/Memory parent-child end-to-end execution remain unverified. Deterministic provider and privilege-escalation tests remain useful lower-layer evidence only. These limitations are recorded, not treated as acceptance passes or a Plan waiver.
- Only after outstanding Plan 21.5/21.8/21.9/21.12 acceptance evidence is obtained (or explicit approved acceptance change) may final product merge, integrated-main revalidation, Record completion, HANDOFF deletion and temporary product branch cleanup proceed. This checkpoint does not claim Phase 6 or task completion.

### CI and cleanup

- Plugin checkpoint and unchanged product HEAD each: **0 check-runs / 0 statuses; combined pending**. No CI pass claimed.
- Verifier owns and cleans its disposable runtime/data/config/browser/client state. Evidence remains ignored, not committed. Automatic command policy rejected deletion of the ignored `.artifacts/client-protocol` generated inspection files with only `blocked by policy`; these harmless local files remain ignored. No bypass attempted.
- Same Record and live HANDOFF retained. Approved Plan unchanged. Resume Phase 6 only; do not redo Phases 1–5 or merge prematurely.

## 2026-10-04 — User-authorized Core integration and unattended MCP game checks

Status: **Complete for the user-authorized integration and unattended local-test scope**. Broader historical Phase 6 provider/client acceptance remains open.

- Explicit instruction: “继续接入 feat/mcp-development-authority 的支持代码，完成最小相关本地验证并集成 main，然后使用 Atria MCP 做无需用户实操设备的测试。” The user also requires minimal relevant local validation at stage/task completion. The Plan index now records this authorization as superseding the historical Phase 6 prerequisite for Core integration. It does not mark paid-provider, Android or human approval UX acceptance passed.
- Core start main: `1661af11245c856363bfc1084275c02b55a97452`; support start: `b2709b5af2664b05f6bd32a05a06097a3e98bd6f`. Integrated and pushed main: `71254a88c3338a2cfb54c3bbd535d0b46e6395a6`, a merge retaining both histories. Exactly one conflict, in Session deletion: the expected HEAD guard now precedes the ironman terminal/cleanup writes. A meaningful regression verifies stale deletion preserves active state and exact deletion retains a terminal tombstone on FS and SQLite. Three existing test formatting violations were cleaned. No main merge into package/plugin/docs.
- Local Core validation: 11 affected suites, **132/132** tests passed, including source/runtime identity, read-only settings, guarded Memory, delegated Agent, model/prompt persistence and HTTP, destructive deletion and run policy. Changed-file ESLint passed in integrated main. The temporary checkout's symlinked local lint plugin initially resolved the allowlist against the original checkout and falsely flagged the already-allowlisted settings endpoint; integrated-main lint resolved that correctly without a rule exception or source change.
- Real installed Codex CLI **0.160.0** app-server connected to an isolated Atria runtime: exactly 18 MCP tools, schema/discovery/status, Session READ and JPEG content passed. No model turn sent by Codex. Main `npm run test:atria` passed with plugin `fbdc372ee05556394d244ab84dac8457954aa7f9`: 168 routes, 24 stdio receipts and 9 populated Memory receipts, same-process stale Experience Epoch and persisted Memory cleanup. Source/Server EXACT; restart browser STALE, reload CURRENT. Source-change and different-revision opt-ins were not repeated. Its controlled restart generated connection-refused/aborted background diagnostics; this is not a zero-error UI claim. Durable reduced evidence: [main-smoke.json](atria-mcp-capability-expansion/main-integration-evidence/main-smoke.json); original detailed artifacts remain local at `plugin:atria-mcp/.artifacts/atria-1791099486088/`.
- Exact Open Lives 3.0.0 release compatibility passed on integrated main: unchanged 152692 bytes / SHA-256 `98e5208b1013370bd377b278d089a8e9f231d507df0a0ce6df0124591649db24`; required capabilities, compiled payload equality, budgets, installer permission refusal/grant, Ready/begin, safe Views and corrupt archive refusal. Historical releases are unchanged.
- Actual MCP game send revealed that the adapter started generation without committing its required user Timeline anchor. Fixed plugin `792a87286e881ea62fc31bdc90b8678ccd715f9b`, pushed: fixed owning Session append followed by generation at the returned exact revision, under one approval and expected boot. Append conflict prevents generation; boot drift after append prevents continuation; rejection/lost response retains committed input identity and indeterminate evidence, without automatic retry. Local plugin **48/48** tests plus source syntax checks passed, including five new ordering/conflict/partial-effect regressions. The public tool inventory and default READ ceiling are unchanged.
- Full-shell observation additionally found a real resumed-run defect: the Host attempted raw `experience.ready` and pump despite the persistent run already being ready and its run policy denying those commands. Fixed in `fix/mcp-native-run-resume`, then fast-forwarded/pushed main: run-policy packages retain their persistent Ready state, initial pending readiness still persists once, and automatic pumping remains with authority turns rather than raw lifecycle commands. Ordinary/ironman resume and initial Ready regressions pass; the affected lifecycle client suite **33/33** and changed-file ESLint passed. Generic lifecycle readiness/pumping behavior is retained. The owned fix branch/worktree was removed after integration.
- The new package-local `tools/mcp-smoke.mjs` uses real stdio MCP, a real disposable product server and a local synthetic HTTP provider. Its bounded policy is limited to reviewed install/start/chat/save/restore; deterministic MCP form acceptance belongs only to owned fixtures and is not human approval UX. Fixture setup uses owning HTTP Ready/begin and trusted shell navigation/local bindings; MCP supplies the subsequent product operations and browser observation. Early harness attempts exposed plain/bounded MCP response handling, missing WebSocket proxy forwarding and startup timing races; those were corrected in the fixture, without a product approval bypass or generic JS/click tool.
- Final integrated main: `e8a5b9fba80f68b7aaa05cf4943737fb6a608f28`; final plugin: `792a87286e881ea62fc31bdc90b8678ccd715f9b`. The final real stdio game smoke passed: 18 tools, runtime/source EXACT, both guard versions 1; exact archive capture/review/install and Work start; zero-provider deterministic begin; two completed Native work turns (coins 20 -> 32 -> 44, effective turns 0 -> 1 -> 2), stale-revision rejection with no mutation, explicit save restore to coins 32 / turn 1, and Timeline reads. Seven successful semantic receipts / seven deterministic form approvals; **4 actual local synthetic HTTP sends**, no paid model. Asynchronous generation was polled to completed rather than treating a 202 start as completion.
- MCP observed the real shell-mounted compiled Native game at **375×812, 390×844, 844×390, 390×400 and 1440×900**. Every capture has browser CURRENT, source EXACT and the saved game text. Initial-account onboarding is seeded completed in the owned fixture; its questionnaire/approval UX is not tested. Mobile and desktop images were visually inspected. The Host Experience recovery toolbar remains visible at the upper-right; this checkpoint does not claim click/occlusion, screen-reader, physical touch, Android or OS keyboard acceptance. Final browser diagnostics contain no page exception or HTTP error; the ten aborted best-effort startup timing requests caused by navigation are retained in the evidence, not relabelled as zero diagnostics.
- Durable final game evidence and all five snapshots/JPEGs: [game-smoke.json](atria-mcp-capability-expansion/main-integration-evidence/game-smoke.json). Reproducible package script and README usage are pushed at `package@065f9532ba32e4a7e6b2c4f7efe3cd892193effb`; generated scratch runtimes/data/config/Secrets/artifact handles and browser state were cleaned. All three historical archive digests remain unchanged. Only local relevant checks were executed; no remote CI was required.
- The support branch is fully retained in main; the remote feature ref is confirmed absent, the local feature branch and owned auxiliary worktree were removed. Original Core `AGENTS.md` and all four unrelated dirty docs files were compared byte-for-byte against their starting diffs and preserved. No existing HANDOFF was present to remove. No remote CI was run or claimed.
- Broader Phase 6 client accept/decline UX, Claude-specific tool invocation, paid production generation/regenerate/reenter/stop, embedding/recall/injection and live delegated model/Memory flows remain unverified. Current unattended synthetic tests do not waive or satisfy those historical quality items.
