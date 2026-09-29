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
