# HANDOFF — Native Frontend Runtime v3

- Task: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Status: **Phase 8 complete — Phase 9 ready, not started**
- Architecture: **Implementation Baseline v1.0 unchanged**
- Task branch: `refactor/native-frontend-runtime-v3`
- Main baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Phase 8 Start HEAD: `c401a27d40d4a1b376f377ec97450f239c129c8b`
- Phase 8 Tested / Pushed HEAD: `7ac92cca563942017ab06da47800e6d0d2a5b722`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: `docs:records/refactor/native-frontend-runtime-v3.md`
- Next: **Phase 9 — Legacy Removal / Regression / Finalize**

## Current implementation

Phases 1–7 established the compiler/exact resource graph, production Renderer,
containment, typed Bridge, Session/Conversation/Prose, Media/localization/input,
boundaries/recovery, QuickJS Supervisor Worker and Canvas, and source-only Studio/
AI authoring using the existing Workspace/Task/human Review flow.

Phase 8 adds one representative native@3 district fixture in the main test system:
Story/Headless Conversation, Phone/SMS/Social/Mail, Church stores, Schedule,
People/Character, remote portraits, collection pages, AI summary and a People-
backed Canvas relationship graph. Six Views share one installed Package/Session.
Formal Project Build -> install/reopen -> hash-checked Runtime resources powers
browser acceptance; Preview resources/runtime are checked against installed data.
No formal Package was upgraded and no reference branch was read.

AI acceptance keeps real executeTask/scheduler/typed finalization/SessionCore;
only model execution is deterministic. Fail-on-send providerCalls remains zero.
Provisional narration is separate from committed messages. Cross-panel writes,
stale cursors/revisions, SavePoint restore, scoped reads, denied/offline portraits,
local retry, Draft retention, VM restart and presentation recovery are exercised.
VM restart retains component state and Session revision and does not replay writes.

Adjacent regression found missing Phase 7 Studio zh-cn/zh-tw copy. Both catalogs
now contain 24 new keys; Runtime features uses the existing localization function
for its accessibility label. No other product behavior or architecture changed.

Key Phase 8 paths:

- `tests/native/helpers/frontend-heavy-fixture.js`
- `tests/native/helpers/frontend-heavy-harness.js`
- `tests/native/frontend-heavy.test.js`
- `tests/frontend/native-frontend-heavy.smoke.mjs`
- `src/native/authoring-examples/frontend-v3/README.md` (Phase 8 usage/limits)
- `public/locales/{zh-cn,zh-tw}.json`
- `public/scripts/native/studio-workspace.js`

## Validation and limits

Windows / Node **v24.16.0** / Edge headless; FS and SQLite included.

- Native broad: **118 suites / 1827 tests passed**.
- Heavy focused: **1 suite / 12 tests passed**.
- Adjacent game-runtime/atria-shell/memory-graph: **148 suites passed, 1 failed**
  (1307 tests passed / 1 failed). The failure was missing Studio localization.
  After the fix: localization **1/4** and Studio workspace **1/3** passed.
- Later Heavy + localization: **2/16 passed**. An extra wrong Studio test path
  produced ENOENT; the correct Studio workspace path then passed separately.
- Final Heavy Edge: **6 scenarios**, Component/Hybrid/Full × 1440px/390px;
  touch emulation, synthetic CJK IME/keyboard viewport, media fallback/retry,
  People-backed Canvas/VM recovery, formal installed graph; providerCalls=0.
- Adjacent Studio authoring Edge: **2 scenarios** at 1440px/390px passed.
- Root lint, final changed-file/test ESLint, final webpack API build and staged
  diff checks passed. No dependency installation or generated assets committed.
- Broad runs began before final fixture/localization refinements; later focused
  checks cover changes. Do not claim a final-commit broad rerun. Full details and
  failed-then-fixed validation history are in the same Record.
- No remote CI, physical IME/keyboard, real Android/Termux/device, other browser,
  external media server, live provider, MySQL or PostgreSQL validation claim.
  Browser fixture has fixed test ownership and deterministic Host generation/media
  seams; it is not a live external-service product session.

## Preserve decisions and next checkpoint

- Baseline v1.0 / Hard Cut frozen. No architecture/Gap Review redo or reference reads.
- Source -> formal Compiler -> derived-readonly Runtime IR; no second Preview semantics.
- Package owns presentation; Host owns capabilities and authority.
- Preserve typed targets, revisions, idempotency, Operation Lifecycle intent,
  SessionCore, Frame Scheduler and Authority Epoch revocation.
- Streaming is not committed Timeline; raw HTML never enters Prose.
- No raw DB, generic durable KV or parallel authority. Route/media/boundary/VM
  generations are local. VM recovery cannot silently replay writes.
- `package` is independent; never merge main into it or upgrade its assets as part
  of this Core task. `main:default/skills/**` and `main:plugins/**` are product assets.

Only start Phase 9 on new user instruction. Follow the Plan's Phase 9 section for
legacy removal, associated full regression/required CI, final integration and
cleanup. Reuse the current task branch and docs worktree. Do not treat historical
Phase summaries as final runtime truth: inspect real refs and code. Keep this
HANDOFF live until final task completion; retain all prior phases in the Record.

## Direct-copy Phase 9 takeover prompt

```text
接手本地 Atria 仓库 ZZZdragondYNGPHX/Atria。
Task: refactor/native-frontend-runtime-v3

现在执行 Phase 9 — Legacy Removal / Regression / Finalize。
Implementation Baseline v1.0 已冻结；不要重新讨论架构或重做 Gap Review。

Phase 8 已完成并 push：
- Phase 8 Start HEAD: c401a27d40d4a1b376f377ec97450f239c129c8b
- Tested task HEAD: 7ac92cca563942017ab06da47800e6d0d2a5b722
- main baseline: 191f9f951ccb23cd11d8951e539b8ff6eb8316db
- 工作分支: refactor/native-frontend-runtime-v3
- Plan: docs:plans/refactor/native-frontend-runtime-v3.md
- Record: docs:records/refactor/native-frontend-runtime-v3.md
- live handoff: docs:HANDOFF.md

开始前 git fetch --all --prune，核对真实 refs / working tree；
依次读取 AGENTS.md、docs:README.md、HANDOFF、Plan、同一 Record。
沿用任务分支和已有 docs worktree，保护无关 dirty changes；不要重置到 main。
优先本地 Git、文件系统、搜索、测试、构建，不绕远程 API 模拟网页流程。

Phase 1–7 的 Compiler/Renderer/Bridge/Session/Media/QuickJS/Canvas/Studio/AI
已完成。Phase 8 在 main 测试体系新增组合 Heavy fixture，正式 Project Build、
install/reopen 与 installed resource API 接真实 SessionCore、Task scheduler。
覆盖 Story/Headless、Phone/SMS/Social/Mail、Church、Schedule、People、Remote
Portrait、分页、AI Operation、People-backed Canvas、三种布局及恢复。
使用 src/native/authoring-examples/frontend-v3/README.md 的 Phase 6–8 说明。

Phase 9 以 Plan 对应章节为唯一权威：删除 Native UI v1/v2 正式 Runtime/compiler、
legacy manifest/componentModelVersion plumbing；删除/改写旧 Studio/Preview paths；
清理 dead CSS/fixtures/tests；关联全量测试和必要 CI；更新同一 Record；完成验证后
才最终 merge main、验证 main、删除任务分支并删除 live HANDOFF。Hard Cut 已批准，
不做 v1/v2 兼容、迁移或长期双 renderer。不要误删 Atria 产品 runtime skills/plugins。
package 是独立长期 workspace，不把 main merge 进去，不提前升级正式 Package。
未经分别明确授权，不读取或更新 reference 分支。

复用现有 Studio/Authoring/Preview/Health、typed Bridge/SessionCore/Task/Frame/Media。
不得新增平行 authority、裸读 raw DB 或建立 generic durable KV。
保留 Operation Lifecycle intent、正式 target、revision guards、Epoch revocation；
streaming 不冒充 committed Timeline，raw HTML 不进入 Prose；
local route/media/boundary/VM generation 不作为 Authority Epoch。
VM 重启保持 Host component state/Session Authority，禁止自动重放写入。
Studio 只改 Source，IR derived-readonly；Preview/Production 不建立第二套语义。
普通问题、失败、merge conflict 和常规决策自行修复推进。

Phase 8 实测：Native 118 suites/1827 tests；Heavy 1/12；相邻广泛回归
148 suites 通过、1 个本地化 suite 失败（1307 tests 通过/1 失败），补齐 Studio
zh-cn/zh-tw 词条后 localization 1/4、Studio workspace 1/3 通过；后续 Heavy+
localization 2/16。曾使用错误 Studio 测试路径产生 ENOENT，已改正确路径验证。
最终 Heavy Edge 6 场景（三布局 × 1440/390）及 Studio Edge 2 场景通过，
providerCalls=0；lint/webpack/diff checks 通过。Node v24.16.0，FS/SQLite。
广泛回归早于最终少量修复，不声称最终 commit 重跑全量。
未做 physical IME/soft keyboard、真机、其他浏览器、external provider/media E2E
或 remote CI；MySQL/PostgreSQL 用现有开关排除。保留这些证据边界。

完成 Phase 9 后按 Governance 完成最终集成、验证、Record 与清理；
若遇真正设备/权限/外部证据阻塞，更新同一 Record 和 live HANDOFF 后清楚交接。
```
