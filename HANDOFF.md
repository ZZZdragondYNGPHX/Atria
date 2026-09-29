# HANDOFF — Native Frontend Runtime v3

- Task: `refactor/native-frontend-runtime-v3`
- Primary Workspace: `main`
- Status: **Phase 7 complete — Phase 8 ready, not started**
- Architecture: **Implementation Baseline v1.0 unchanged**
- Task branch: `refactor/native-frontend-runtime-v3`
- Main baseline: `191f9f951ccb23cd11d8951e539b8ff6eb8316db`
- Phase 7 Start HEAD: `99018afb750fc651c0d00f4d56a5bb946b8408e7`
- Phase 7 Tested / Pushed HEAD: `c401a27d40d4a1b376f377ec97450f239c129c8b`
- Plan: `docs:plans/refactor/native-frontend-runtime-v3.md`
- Record: `docs:records/refactor/native-frontend-runtime-v3.md`
- Next: **Phase 8 — Integration / Heavy Frontend Acceptance**

## Current implementation

Phases 1–6 established the canonical compiler/resource graph, renderer and visual
containment, local presentation, typed/scoped Bridge, Managed/Headless Conversation,
Session projections/revision guards, Prose, Media, localization, input/environment,
boundaries/recovery, isolated QuickJS Worker VM and retained Canvas buffers.

Phase 7 integrates native@3 authoring into Studio. The Experience form declares
source/features and proposes safe minimal source files for new frontends. The UI
editor browses Experience-owned Source Graph entries and edits .aui, contracts,
Nodes, state scopes, interactions, View metadata, styles, Bridge and localization.
It exposes feature support/reason codes, permission declarations and remote origins.

Source edits are the only editable authority. frontend.patch resolves semantic IDs
using AUI/JSON CST spans and preserves unrelated comments/format/CRLF. Proposals
pin source hashes and the existing Workspace revision. Multiple patches to one
file share the baseline hash and apply in order. Invalid source rolls back.

Read-only draft inspection invokes the formal Compiler. Preview reuses existing
Workspace evaluation, Build, StudioPreviewHost and the production Renderer with
read-only Preview Bridge. It does not create a Play Session or persist drafts.
Diagnostics retain source coordinates through parser/compiler/ChangeSet. The
feature/permission closure validator is shared with installed validation.

Project Agent has atri_agent_frontend_graph and atri_agent_frontend_patch. It still
requires Plan/Task revision, forces agent origin, evaluates through Workspace and
stops at human Review. No new commit, DB, KV, Session or Task authority exists.

Key paths:

- `src/native/frontend/{authoring,source-edits,aui-parser,compiler}.js`
- `src/native/authoring/studio-service.js`
- `src/native/{project-agent,authoring-contracts,authoring-reference,experience-validation}.js`
- `src/endpoints/native-studio.js`
- `public/scripts/native/{studio-frontend-editor,studio-workspace,studio-client,studio-agent}.js`
- `src/native/authoring-examples/frontend-v3/README.md` (Phase 7 usage)
- `tests/native/frontend-authoring.test.js` and authoring fixture
- `tests/frontend/native-frontend-authoring.smoke.mjs`

## Validation and limits

Windows / **Node v24.16.0** / Edge headless; FS and SQLite included.

- Broad Native: **117 suites / 1815 tests passed**.
- Focused Studio/Compiler/Script/Media/Agent: **8 suites / 160 tests passed**.
- Adjacent Studio/Agent UI/Source: **3 suites / 12 tests passed**.
- Later compiler/media/source/Studio: **4 suites / 74 tests passed**.
- Final source-authoring + Studio-workspace: **2 suites / 25 tests passed**.
- Final real Edge: **1440px and 390px**, semantic edit, authenticated service / HTTP,
  formal Preview renderer, invalid-source diagnostics, source navigation, CRLF/draft
  retention, Review, unchanged project revision and disposal. Mobile inspected.
- Root lint, final changed-code/test lint, final webpack and staged diff checks pass.
- Broad regression preceded final small refinements. Do not claim a complete rerun
  on final commit. Record details ordering. MySQL/PostgreSQL excluded by switches.
- No remote CI, physical IME/keyboard, Android/Termux/device, other browser,
  external-media-server or real-provider E2E claim. Browser harness is a temporary
  FS ProjectStore with deterministic source and no provider calls.

Validation is on demand. Larger structural additions/deletions and mixed-content
replacement use Source workflow; structured edits target existing semantic IDs.
Whole JSON/style replacement intentionally changes that selected value/block.
Some graph diagnostics locate a file/block rather than one token. Accessibility
advice is not certification. Legacy renderer removal remains Phase 9.

Phase 6 VM bounds/recovery remain as recorded: QuickJS guest heap, worker hard
termination, bounded modules/messages/async work/Operations, safe Node/Media handles
and batched Canvas. VM restarts preserve Host component state and Session Authority;
recovery cannot replay writes. Local generation tokens are not Authority Epochs.

## Preserve decisions and next checkpoint

- Baseline v1.0 / Hard Cut frozen. No architecture/Gap Review redo or reference reads.
- Source -> formal Compiler -> derived-readonly Runtime IR. No second Preview semantics.
- Package owns presentation; Host owns capabilities and authority.
- Preserve uses, typed targets, revisions, idempotency, Operation Lifecycle intent,
  SessionCore, Frame Scheduler and Authority Epoch revocation.
- Streaming is not committed Timeline; raw HTML never enters Prose.
- No raw DB, generic durable KV or parallel authority; route/media/boundary/VM
  generations remain local. Never silently replay writes after recovery.

Only start Phase 8 on a new user instruction. Follow the Plan's representative
heavy frontend acceptance in the main test/fixture system. Do not merge main into
package or read reference branches without specific authorization. Do not start
Phase 9 or final integration. Reuse the task branch and existing docs worktree;
fetch and inspect real refs and working trees before proceeding.

## Direct-copy Phase 8 takeover prompt

```text
接手本地 Atria 仓库 ZZZdragondYNGPHX/Atria。
Task: refactor/native-frontend-runtime-v3

现在执行 Phase 8 — Integration / Heavy Frontend Acceptance。
Implementation Baseline v1.0 已冻结；不要重新讨论架构、重做 Gap Review 或开始 Phase 9。

Phase 7 已完成并 push：
- Phase 7 Start HEAD: 99018afb750fc651c0d00f4d56a5bb946b8408e7
- Tested task HEAD: c401a27d40d4a1b376f377ec97450f239c129c8b
- main baseline: 191f9f951ccb23cd11d8951e539b8ff6eb8316db
- 工作分支: refactor/native-frontend-runtime-v3
- Plan: docs:plans/refactor/native-frontend-runtime-v3.md
- Record: docs:records/refactor/native-frontend-runtime-v3.md
- live handoff: docs:HANDOFF.md

开始前 git fetch --all --prune，核对真实 refs / working tree；
依次读取 AGENTS.md、docs:README.md、HANDOFF、Plan、同一 Record。
沿用任务分支和已有 docs worktree，保护无关 dirty changes；不要重置到 main。
优先本地 Git、文件系统、搜索、测试、构建，不绕远程 API 模拟网页流程。

Phase 1–6 compiler/renderer/containment/local presentation/typed Bridge、
Managed/Headless Conversation/Session/Prose、Media/localization/input/environment、
Boundaries/recovery、QuickJS Supervisor Worker/isolated VM、exact JS/TS graph、
Controller ABI/budgets、Canvas2D buffers 和 source maps 已完成。
Phase 7 已完成 native .aui/Source Graph/structured editors、CST semantic patches、
正式 Compiler/Renderer Preview、source diagnostics、feature/permission visibility、
AI frontend_graph/frontend_patch 与现有 Task/Workspace/human Review 接入。
使用 src/native/authoring-examples/frontend-v3/README.md 的 Phase 6–7 说明。

Phase 8 以 Plan 对应章节为唯一权威。使用 main 测试/fixture 体系中的代表性
Heavy Frontend 验证 Story/Headless Conversation、Phone/SMS/Social/Mail、Church/经营、
Schedule、People/Character、Remote Portrait、Collection pagination、AI Operation、
Canvas 关系图、Component/Hybrid/Full、mobile/touch/IME、offline/denied/recovery。
Deterministic tests 的 providerCalls 必须保持 0；验证 Desktop/Mobile 关键 E2E、
Package build/install/preflight 与 Session/Authority/Memory/Lifecycle 相邻回归。
package 是独立长期 workspace，不把 main merge 进去；不要提前升级正式 Package。
未经分别明确授权，不读取或更新 reference 分支。

复用现有 Studio/Authoring/Preview/Health、typed Bridge/SessionCore/Task/Frame/Media。
不得新增平行 authority、裸读 raw DB 或建立 generic durable KV。
保留 Operation Lifecycle intent、正式 target、revision guards、Epoch revocation；
streaming 不冒充 committed Timeline，raw HTML 不进入 Prose；
local route/media/boundary/VM generation 不作为 Authority Epoch。
VM 重启保持 Host component state/Session Authority；禁止自动重放写入。
Studio 只改 Source，IR derived-readonly；Preview/Production 不建立第二套语义。
Hard Cut 已批准，不做 v1/v2 兼容/迁移。普通问题、失败和常规决策自行修复推进。

Phase 7 实测：Native 117 suites/1815 tests；聚焦 8/160；相邻 Studio UI 3/12；
后续聚焦 4/74；最终 authoring/workspace 2/25；Edge 1440px 和 390px 作者链路通过；
lint/webpack/diff checks 通过；Node v24.16.0，FS/SQLite。
广泛回归早于最终少量修复，不声称最终 commit 重跑全量。
未做 physical IME/soft keyboard、真机、其他浏览器、external provider/media E2E
或 remote CI；MySQL/PostgreSQL 用现有开关排除。

Phase 8 完成后：适当本地验证并 push tested HEAD；
更新同一 Record 和 HANDOFF，记录 Start/Tested HEAD、验证、关键决策、剩余项；
生成 Phase 9 接手提示词；停止，不开始 Phase 9，不提前 merge main 或删除任务分支。
```
