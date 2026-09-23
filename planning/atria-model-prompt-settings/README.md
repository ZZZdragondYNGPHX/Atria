# Atria 模型、提示词与 Runtime 原生化企划

**状态：P0、P1、P2 已完成并验证；当前下一阶段为 P3 — Request Context & Prompt Compiler。**

## 当前基线

- 仓库：`ZZZdragondYNGPHX/Atria`
- 已核对主线：`main@2d1c3ec9c8039ecc4728ebe712f4a9f14186906f`
- 正式实现分支：`refactor/atria-model-prompt-settings`
- 正式总纲：`refactor/atria-model-prompt-settings.md`
- 既有基础：Native Content & Session N0–N10、Native Authoring Platform & Product Frontend A0–A9 均已完成并冻结。

本目录不再是“等待 A6/A7 完成后复核”的旧设计稿，而是本次重构的详细实施资料包。

## 阅读顺序

1. [DESIGN.md](DESIGN.md)：最终对象模型、权威边界、Prompt/Context/Generation 架构、产品界面与 hard-cut 决策。
2. [EVIDENCE.md](EVIDENCE.md)：基于当前 main 的代码事实、旧依赖、冻结合同和 guard 冲突。
3. [IMPLEMENTATION.md](IMPLEMENTATION.md)：P0–P8 实施阶段、每阶段退出条件和验证要求。
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

最终一致性检查确认，一部分旧 guard 包含当时的过渡实现细节，例如：

- A6 强制存在 Advanced Connection compatibility editor；
- A6 强制独立 Capabilities route；
- A8 强制 Studio Agent 通过 `generateTask`。

本次允许在对应新 authority 完成时**有证据地升级这些字面 guard**，但必须保留原本要保护的产品/权限/事务不变量。禁止简单删除 frozen guards 或为了旧正则而恢复过渡依赖。

## 开发节奏

这是多阶段任务。每个 P 阶段完成后：

1. 运行对应 focused checks 与适用的 frozen guards；
2. 更新 docs 进度与最新 handoff；
3. 记录分支 HEAD、已完成、未完成、关键决策和验证；
4. 停止继续实施；
5. 给出下一阶段可直接复制的新对话提示词。

Android / Docker 保持 opt-in。


## P0 已落实

P0 validated HEAD：`472e1a9f0759a460d845a2e6c618983c35e18654`。

P0 已把设计从文档冻结成代码合同与 CI 边界：

- 六个核心对象 contracts；
- RequestContextPlan / Prompt IR / EffectiveRequestSnapshot；
- capability 三态与 provenance；
- `runtime.modelPrompt` Package metadata；
- 五类 Port contracts；
- `src/native/model-prompt-runtime/` architecture guard；
- frozen guard evolution matrix。

P0 没有切换 Runtime UI，没有删除 A6/A8 过渡 seam，也没有进入 P1 persistence。


## P1 已落实

P1 validated HEAD：`802a68654f53015800e141fd052f1a006df149e0`。

已完成：

- generic versioned JSON resource handler；
- Prompt Module / Prompt Program / Generation Profile 的 Library exact persistence；
- A2 Registry / derived Resource Graph 接入；
- Attach / Fork / Update 复用 A1 Workspace / ChangeSet；
- Project / Library / Package exact origin + provenance；
- Package exact dependency closure 与 missing-exact fail closed；
- Connection / Model / player Runtime Route persistence；
- Secret 仅保存 `secretRef`；
- P1 architecture guard 与 CI。

## P2 已落实

P2 validated HEAD：`5d5ab196c37ad7ff25db44d9dd249c0863b94115`。

GenerationService、exact RouteResolver、能力三态/provenance、完整路由 fallback、
request-local immutable config、send-boundary Secret 和两种 Provider adapter fixtures
已实现。本地 Native FS/SQLite：48 suites / 347 tests；P2 focused：33 tests；
P0/P1/P2 与 A1/A2/A7/A8 guards、lint、syntax、frontend build 均通过。

详见 [P2-VALIDATION.md](P2-VALIDATION.md)。下一阶段仅 P3，不重做 P0/P1/P2。
