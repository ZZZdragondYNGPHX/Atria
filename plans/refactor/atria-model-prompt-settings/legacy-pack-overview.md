# Atria Model / Prompt / Runtime Native Refactor — Legacy Planning Pack Overview

> Former planning-pack README retained for provenance. Current routing authority is index.md.

# Atria 模型、提示词与 Runtime 原生化企划

## 当前基线

- 仓库：`ZZZdragondYNGPHX/Atria`
- 正式实现分支：`refactor/atria-model-prompt-settings`
- 正式总纲：`refactor/atria-model-prompt-settings.md`
- 既有基础：Native Content & Session N0–N10、Native Authoring Platform & Product Frontend A0–A9 均已完成并冻结。

## 阅读顺序

1. [DESIGN.md](DESIGN.md)：最终对象模型、权威边界、Prompt/Context/Generation 架构、产品界面与 hard-cut 决策。
4. [NEXT.md](NEXT.md)：当前执行状态、下一阶段和新对话接手指令。

## 这次重构真正解决的问题

不是“给旧 Preset Manager 换皮”，而是把 Atria 的 Model / Prompt / Runtime 从 SillyTavern 旧配置权威中切出来，使其逐步形成可独立运行的产品核心。

目标依赖方向：

    Atria Domain / Runtime / Authoring
                  ↓
               Host Ports
                  ↓
        SillyTavern Compatibility Adapter

SillyTavern 可以暂时继续承担宿主与底层成熟 sender，但不再定义 Atria 的配置、Prompt、Route、Context 或正式产品 UI。

## 最终核心对象

- Connection Profile
- Model Profile
- Generation Profile
- Prompt Module
- Prompt Program
- Runtime Route

运行期产物：

- Request Context Plan
- Prompt IR
- Effective Request Snapshot

不再继续增加顶级概念。Message Format 属于 Model Profile 子能力；Stage 属于 Prompt Program；Output Contract 属于 Runtime Request。

## 已封板的重要决定

- Package 只携带可分发作者意图与运行能力要求；不携带 Secret 或用户 Connection。
- Model Profile 属于玩家/设备运行环境；Package 只能声明 requirement/recommendation。
- Prompt Module / Program 与 Generation Profile 成为 Native versioned resources。
- 单模型 RP 是一等路径；Orchestrator 只投影同一 Prompt Program 的阶段职责。
- Prompt Stage 不是第二个 Orchestrator。
- Prompt 不建立第二套持久状态系统；持久写入继续走 Native Session State / Revision 事务。
- Runtime Route 使用 stable IDs/revisions，不再以旧 preset/profile 名称作为身份。
- `context.generateTask()` 降级为兼容 facade；新的 Native Generation Service 是 Core。
- Native Session Context 不被其他任务强行复用；公共边界是 `RequestContextPlan`。
- A2 只增加足以承载 Prompt/Generation 的通用 versioned JSON resource handler，不重写 World/Knowledge/Asset 现有专用 repo。
- `package.presets` 不进入新 Runtime contract。
- 旧数据不自动双写或隐式迁移；未来如需要，只允许显式一次性单向导入。
- 正式 Atria UI 不再 reparent legacy ST DOM。

## 产品前端

长期产品蓝图仍是 Home / Play / Library / Studio / Runtime。

但本任务只完整落地 Model / Prompt / Runtime 相关切片，避免重新做一遍 A0–A9：

- Runtime：Routes / Models / Connections / Profiles / Diagnostics
- Library：Prompt Programs / Prompt Modules / Generation Profiles
- Build/Studio：Prompt Authoring / Runtime Design
- Settings：收回真正的产品偏好职责
- Global Search：只导航到归属页面，不跨域注入 UI

现有 A6 主导航中的 `Build` 本轮不改名为 Studio；这是未来全局信息架构任务，不作为本 refactor 的阻塞项。

## 冻结合同

N0–N10、A0–A9 的**语义不变量**继续保留。

- A6 强制存在 Advanced Connection compatibility editor；
- A6 强制独立 Capabilities route；
- A8 强制 Studio Agent 通过 `generateTask`。

## 开发节奏

通用执行流程见 [Governance §8](../../../README.md#8-task-lifecycle)。

Android / Docker 保持 opt-in。

## P0 已落实

P0 已把设计从文档冻结成代码合同与 CI 边界：

- 六个核心对象 contracts；
- RequestContextPlan / Prompt IR / EffectiveRequestSnapshot；
- capability 三态与 provenance；
- `runtime.modelPrompt` Package metadata；
- 五类 Port contracts；

P0 没有切换 Runtime UI，没有删除 A6/A8 过渡 seam，也没有进入 P1 persistence。

## P1 已落实

已完成：

- generic versioned JSON resource handler；
- Prompt Module / Prompt Program / Generation Profile 的 Library exact persistence；
- A2 Registry / derived Resource Graph 接入；
- Attach / Fork / Update 复用 A1 Workspace / ChangeSet；
- Project / Library / Package exact origin + provenance；
- Connection / Model / player Runtime Route persistence；
- Secret 仅保存 `secretRef`；

## P2 已落实

GenerationService、exact RouteResolver、能力三态/provenance、完整路由 fallback、
request-local immutable config、send-boundary Secret 和两种 Provider adapter fixtures
已实现。本地 Native FS/SQLite：48 suites / 347 tests；P2 focused：33 tests；

下一阶段仅 P3，不重做 P0/P1/P2。

## P3 completion checkpoint (2026-09-23)

P3 is complete at `5e51332b34146236fd4d4a6d45c25ef7c37a9e08` on the existing work branch. No first-party/UI
cutover or main merge occurred. Earlier P3-future statements above are historical.

 P4 First-party Runtime Cutover is next,
only after explicit continuation. A6/A8 transitional gates remain unchanged in P3.

## P4 completion checkpoint (2026-09-23)

P4 is complete at `6cba266814a7ff04666220f1031efdb844ad4e46`. First-party Native
generation uses the exact route service/context/compiler. Earlier
P4-future statements are historical. Next is P5 only after explicit continuation.

## P5 completion checkpoint (2026-09-23)

P5 complete at `0cb56b9a0d37789025fb8069d08f6f43ead2413d`. Native Runtime Routes/Models/Connections/Profiles/Diagnostics
replace the compatibility editors, reuse P1 exact storage and P4 host, and provide
compile-only preview, remediation, search deep links and mobile fullscreen editors. Broad FS/SQLite:
206 suites / 1811 tests; final focused: 6 / 39; real P4/P5 browser: 8 passed. No main merge or P6 implementation.
P6 Library & Studio Authoring is next, only after explicit continuation.

## P6 completion checkpoint (2026-09-23)

P6 complete at `2351be51e8c8cbdadf0966104ec607018e93de6e`. Library Prompt/Generation exact resource
views and Fork/Derive, A1-reviewed Studio Prompt Authoring/Runtime Design, scoped
pickers/preview, Package derive freeze and owner-aware Package Resource Graph are
implemented. Primary Build and A1/A2/A7/A8 authority remain. Final regression:
209 suites / 1830 tests; final P6 real-browser desktop/mobile: 2 passed, with 8
adjacent P4/P5 cases passing separately in the combined run. Final screenshots
inspected.
No main merge or P7/P8 implementation. P7 is next only on explicit continuation.

## P7 completion checkpoint (2026-09-23)

P7 complete at `bde2fbc1ed58bc8f9a915dc7c2e72c210917c245`. Settings is preference-only,
Studio no longer edits package.presets, Search navigates to exact owner/revision
Library details and refreshes on Command open, and legacy preset UI reads are
Native-disabled behind one explicit compatibility boundary. Simplified Chinese
Prompt/Runtime/Settings labels and dynamic stages use existing localization.
Final FS/SQLite regression: 210 suites / 1837 tests; P4-P7 combined browser: 12
passed, final P4/P7 follow-up: 6 passed (overlapping). Screenshots inspected. No main merge; stop before P8.

## P8 integrated completion (2026-09-23)

P0-P8 is complete and merged through PR #85. The temporary branch was deleted.
Earlier phase-specific future/stop statements in this document are historical.

Local: 210 suites / 1844 tests; current P4-P7 browser 12 cases plus Workspace
2 cases, desktop/mobile screenshots inspected;
No new phase is implicitly started. Future independent work begins from live main.
