# 异闻之城

从普通人的生活出发，在西幻城市中谋生、结交人物，逐步接触超凡力量。

当前版本为 **3.0.1 简体中文版**（原名 Open Lives / 开放生活志）。角色创建、开篇、人物与机构名称、能力与代价、状态反馈、随身记事、存读档和公开城市常识均已汉化；故事叙述与新增当地际遇也明确使用自然的简体中文。当前版本的玩法以 [内容与界面约定](runtime/ROLEPLAY.md) 为准。

[下载《异闻之城》3.0.1](releases/3.0.1.atria)。156341 字节；SHA-256：`31b5e467e1e6109e1c9a10a053c41c5bdd96286b973c8c3db436b855fe7cd86b`。PackageVersion：`pkgv_5006e5160cce49ca333e07efbde34189`。

通过 Atria 的 Package 安装入口导入，允许生成权限，配置模型后打开 **异闻之城：从凡人开始**。开始前选择普通或铁人模式，并完成五项生活境况选择。普通模式死亡后可以读取较早存档；铁人模式只能继续当前进度，死亡后本局结束并清理存档。

3.0.1 使用新的独立版本标识；旧版本存档继续属于原版本，不承诺迁移。1.0.0、2.0.0、3.0.0 成品完整保留。游戏要求支持 story-start、generation-budget、run-policy 和固定 Host 读取的 Core；Atria 首次语言设置的修复随产品 main 提供。

```bash
node tools/content-check.mjs
node tools/package.mjs validate --core <main-checkout> --archive releases/3.0.1.atria --release-only
node tools/package.mjs validate --core <main-checkout> --archive releases/3.0.1.atria
node tools/package.mjs validate --roleplay-ui-only --core <main-checkout> --archive releases/3.0.1.atria
node tools/mcp-smoke.mjs --core <main-checkout> --mcp <plugin-checkout>/atria-mcp
node tools/package.mjs validate --fixture --core <main-checkout>
node tools/package.mjs build --core <main-checkout> --out <new-build-path.atria>
```

These are local isolated Native/HTTP synthetic-provider checks. The UI check also mounts the compiled Native components in Playwright Chromium with the Core QuickJS worker bundle available. It verifies questionnaire, draft preservation, conversation, public drawer, save/restore and terminal presentation; production-model narrative quality and actual mobile operating systems remain untested. The new profile does not require a fixed profession, Second Death, family, long life or historical campaign completion. `--legacy` selects the retained v2 compiler; historical-only flags, `--v1-campaign` and `--fixture` remain explicit regression paths. Native frontend-model/browser exports run through their harness, not as standalone validation commands.

The MCP smoke requires an installed plugin and the Core Node/dependency ABI (locally Node 22). It starts fresh temporary Atria data, calls the real stdio MCP for exact release capture/review/install/start, chat and save/restore, and observes the real shell-mounted game at mobile, landscape, reduced-height and desktop viewports. Fixture setup opens the Session and supplies local routes; Ready/begin uses the owning HTTP authority. Approvals are deterministic test-client form responses. Evidence goes to `build/mcp-3.0.1/`; no personal data, paid model, physical device or OS keyboard is used.

The material below documents the retained releases and their historical acceptance.

Task: package/original-occult-western-fantasy-game. Long-lived independent package workspace.

## Retained release: 2.0.0

[Download 2.0.0](releases/2.0.0.atria). 237739 bytes; SHA-256 e4d0f3521e6a6e9fd0f3a4220b08a7e8fd5388c7f80ec56fe2671f28de0d2efe.

Completed the user-amended continuous 1,000-content-turn / 200-year acceptance in 24 minutes, plus a separate sparse 50-year advance. Actual alternating Fs/SQLite imports: 48. Full final-archive Native browser, runtime, fixture and installer checks passed. The original 10k soak is optional and was not executed as this final gate.

Install through Atria's Package installer, grant generation permission and open Second Death — Eastbank Convergence. Use Native Core c8d2d0e0c11c283ade2fa3c730740a0dc480c746 or a descendant; configure generation in the Host, enter Ready and complete the six ordinary identity choices. Host owns Save/Restore. Version 2.0.0 has a distinct immutable PackageVersion; old-version save migration is not claimed.

**Phase 7 UI/UX:** implemented against the
[player-facing experience specification](https://github.com/ZZZdragondYNGPHX/Atria/blob/docs/plans/package/original-occult-western-fantasy-game-long-lived-world/player-facing-experience.md)
for page structure, register styling, long-life forms, safe data wiring and browser
acceptance. The [frontend design entry](frontend/DESIGN.md) routes implementers to
that plan. Three destinations expose bounded Chronicle reads, public world
history, reviewed long-term forms, travel, identity and checkpoint-aware Retry.

Task: refactor/original-occult-western-fantasy-long-lived-world. All eight phases are complete. Final acceptance measured the same continuous save at 250, 500 and 1,000 content turns, spanning 50, 100 and 200 years respectively.

Explicit `--legacy` builds use an open-ended Native minute clock, Gregorian chronology, stable identity/provenance primitives, persistent Stances and event-driven human/family/institution/enterprise/regional resolution. Day 31 and year rollover are valid. See [the runtime contract](runtime/LONG-HORIZON.md) for chronology and Save/Restore semantics; its early-stage exclusions describe that historical contract.

Phase 2 adds tiered history, exact canonical facts, artifacts/hooks, subjective memory, indexed Chronicle queries and portable checkpoints. See [the history contract](runtime/HISTORY-MEMORY.md), especially the archive/Retry boundary and growth limitations.

Phase 3 adds human/family/office lifecycle and costly non-terminal reconstruction. See [the lifetime contract](runtime/HUMAN-LIFETIMES.md).

Phase 4 adds renewable state-bound Matters, semantic cooldown, real Historical Hook reuse, portable history promotion and evolving geography/institutions. The first full 5k-turn/50-year candidate passed during Phase 4. Final completion is established by the amended Phase 8 acceptance above. See [the renewable-content contract](runtime/RENEWABLE-CONTENT.md).

Phase 5 adds mature progression, identity-linked credentials/property, real delegated cashflow, hidden failures, causal inheritance and institutional autonomy. See [the enterprise contract](runtime/ENTERPRISE-CONTINUITY.md).

Requires Native Core c8d2d0e0c11c283ade2fa3c730740a0dc480c746 or a descendant for Chronicle, public world/calendar reads, checkpoint retirement and refusal recovery. CI status, exact tested heads and integration evidence are in the permanent Package Record. Historical 1.0.0 remains unchanged. The source manifest is the retained fixture/bootstrap input; tools/package.mjs emits the distinct v2 release identity under `--legacy`.

## Retained release 1.0.0

[Download the retained Atria Package](releases/1.0.0.atria). PackageVersion: pkgv_4ca39e21c235a6126c70f8327f0b194f.

A bounded 30-day campaign: six-step ordinary character creation, Second Death, six semi-open Signature inquiries, earned Breach/Claim/Price, professional Patterns and the six-dimensional Eastbank Hearing. The Native field register exposes acquired evidence, provenance, attributed testimony, findings and hypotheses without revealing hidden Canon. Deep cause remains unresolved. No new gameplay was added in P9.

The final archive is 201572 bytes, SHA-256 e696ffdc19129bce4e83e7829138fc981b04186afb187718f1b5984fff8dcd09. History is retained; builds never overwrite an existing file. The separately retained 2.0.0 release has its own immutable identity.

## Install and play the retained 1.0.0 release

Import the .atria through Atria's Package installer, grant its required generation permission, and select Second Death — Eastbank Convergence. Use a host supporting required authority-transaction@1, world-simulation@1 and Native frontend-script@1; verified Core main is e8d0b983f30c22a169e8283157ccd7b4a1dd475d. Configure generation through the Host; no credentials are bundled. Enter Ready, complete ordinary identity creation, then use Field notes/Host Composer and the reviewed typed actions. Save/restore is owned by the Host.

## Validate / build / preview

Run with Node and an independent current Atria main checkout with its dependencies:

~~~text
node tools/content-check.mjs
node tools/package.mjs validate --legacy --core <main-checkout>
node tools/package.mjs validate --fixture --core <main-checkout>
node tools/package.mjs validate --long-horizon-only --core <main-checkout>
node tools/package.mjs validate --history-only --core <main-checkout>
node tools/package.mjs validate --lifetime-only --core <main-checkout>
node tools/package.mjs validate --renewal-only --core <main-checkout>
node tools/package.mjs validate --century-only --core <main-checkout>
node tools/package.mjs validate --enterprise-only --core <main-checkout>
node tools/package.mjs validate --opening-only --core <main-checkout>
node tools/package.mjs validate --campaign-only --core <main-checkout>
node tools/package.mjs validate --campaign-only --v1-campaign --core <main-checkout>
node tools/package.mjs validate --frontend-only --core <main-checkout>
node tools/package.mjs preview --v1-campaign --retained-v1 --release-only --archive releases/1.0.0.atria --core <main-checkout>
node tools/package.mjs build --legacy --core <main-checkout> --out <new-build-path.atria>
~~~

Phase 6 adds real-time regional travel, persistent remote hubs, sparse macro history and conditional Era-sensitive content. See [the regional contract](runtime/REGIONAL-HISTORY.md).

--regional-only runs the user-approved 100-content-turn/50-year focused Phase 6 acceptance. --regional-full explicitly selects the optional original 5k soak; other ATRIA_RENEWAL_TURNS overrides are smoke only.

--enterprise-only runs the focused 50-year Phase 5 candidate with twenty years of delegation, identity/title continuity, institutional resistance and eight actual portable Save/Restore transitions. This is not Gate A/B/C.

--renewal-only runs the actual 5,000-content-turn/50-year candidate with two generations, late history reuse, structural repetition audit and five real portable checkpoint imports. Measured exports use existing Native history.compact; compaction/setup/clock-only actions do not inflate the content count. A smaller ATRIA_RENEWAL_TURNS override is smoke evidence only.

Explicit `--legacy` validation retains the P5/P6/P7 regression matrix against the new foundation; this is not a repeat of the v1 completeness audit. --long-horizon-only checks the Phase 1 time/identity/stance and actual Fs/SQLite Save/Restore contract. --lifetime-only checks Phase 3 human/family/office lifecycles over 90 years and nine real Fs/SQLite save imports (see runtime/HUMAN-LIFETIMES.md). --history-only runs the history-only 1k-turn/10-year development gate, repeated real Save/Restore, early century-retrieval analogue and checkpoint growth audit; it is not full Gate A lifecycle/content coverage. --opening-only stops after the retained opening checks. --v1-campaign explicitly selects the old bounded campaign. --fixture retains P2/P3/P4 under a distinct immutable regression identity. --campaign-only performs a continuous committed campaign, interleaved Signatures, actual Branch Retry and save-container continuation beyond Day 30 (or bounded day30 under --v1-campaign). --frontend-only requires Edge Chromium (or ATRIA_BROWSER_CHANNEL) and the Core Playwright/browser bundle; screenshots go to build/ui-<version>. These are real Native/UI tests with a local synthetic HTTP provider, not hosted-model evidence.

--retained-v1 verifies the unchanged original archive digest and its embedded assets through the release-only installer checks; it does not assert correspondence with the current v2 frontend or migrate old saves.

--century-only is the fixed user-approved 1,000-content-turn / 200-year final acceptance, including real alternating Fs/SQLite imports, generation chains, inheritance/reconstruction, organization drift, relocation, late historical reuse, semantic and bounded transient/context audits. Preparation, clock-only jumps and imports are excluded from the content count. The original 10k stress workload is optional.

--archive decrypts and validates the saved archive, comparing its normalized manifest, every compiled file and every Data asset against the current build. --release-only checks fixed budgets, model-resource origins, permission/install/Ready, safe views and corruption refusal. This preview is an integration preview, not itself a screenshot; the separate frontend suite supplies visual evidence. Container salt/nonce vary, so payload equality, not rebuilt archive hash equality, establishes source correspondence.

## Ownership and boundaries

- manifest.json and runtime/model-resources.json own immutable Package/model origins. Build-time compilers emit declarations and Native presentation assets, not an alternate authority engine, RNG or persistence service.
- data/ contains 40 hash-pinned resources / 240 structured assets (482200 bytes; largest 78485 bytes). Hidden Canon and private institutional/actor state remain behind safe projections. Six public Knowledge entries are installed but unbound.
- runtime/OPENING.md, NETWORK.md and CONVERGENCE.md describe retained stage contracts; their historical version/scope notes are not current release status. runtime/FRONTEND.md describes the current long-life UI and retained opening-era flows.
- Historical v1 budgeting: 64/64 transactions, 9 publication reads/15 commands, static maximum24; Evidence248/256, summary232/256, Graph169/256; maximum formula2000/2048. Intent keeps compact investigation.nodes; both full-detail Graphs use investigation.details. P9 observed maximum15 reads/17 commands/19 effects and13492 observation bytes, below16384.
- Historical v1 fixture only: one world clock, day30 horizon, <=2880 minutes per advance, maxSteps3/maxDeliberations1; Day31 rejects atomically. The retained v2 foundation replaces the date/advance ceiling with safe-integer chronology and constant-work intervals. The16 Seeds/32 archetypes are bounded supervised-carrier contracts, not arbitrary Claim Engineering. Extra Pattern instances are bounded. Hearing dimensions remain independent.
- Normal new operations acquire a current bridge handle. Unknown-commit retry retains original epoch/revision/input/key. Process-local selection pinning, same-anchor RNG, committed idempotency and actual save-container restoration are distinct guarantees.
- No claim of cross-process uncommitted journal recovery, old-version save migration, hosted-model behavior, physical-device/screen-reader or OS-crash verification. Paper/light UI is intentional, not a separate dark theme. Later-state browser setup uses Native transactions, not every action clicked.

Exact tested/pushed HEADs and durable P9 reports/screenshots are in the same Package Record on docs. package remains independent; main is not merged into it.

A focused route regression can be run with `--route-preflight-only` added to the
MCP smoke command. It installs the exact 3.0.1 release in disposable data, checks
that narrator-only configuration cannot start despite complete purpose bindings,
then adds Intent resolver and verifies readiness. It uses MCP installation and
route reads, the owning HTTP preflight, zero inference calls and no browser.
Evidence goes to `build/mcp-route-preflight-3.0.1/`.
