# Atria 原生 Package Runtime 能力体系 — Record

- Task ID: `ARCH-NATIVE-PACKAGE-RUNTIME`
- Primary Workspace: `main`。
- Status: Active — S1 / S2 / S3 已完成，CP1 核心闭环已推送；等待用户续接 S4 → S5。
- Plan：[唯一入口](../../plans/architecture/native-package-runtime/index.md)。
- 实时恢复：[HANDOFF](../../HANDOFF.md)。

## 概要

从 Tavern Helper 与 Prompt Template 定向提炼需求，对照 Atria Native Runtime；经讨论确定 Package、Authority、Script、State、Prompt / Knowledge、Task 和 Processing 的职责边界。正式企划以 docs Plan Bundle 持久化，支持换设备续接。

## S0 — 定向研究与企划发布

- 日期：2026-10-06。
- Start / End 产品 HEAD：`4ac8affbf01bfb5fb576834bb7eedbeefd03c007`；未修改产品源码。
- docs 起点：`5104ee5ef78f65a75194f2894d8b4ac935744c89`。
- 外部研究锁定提交：Tavern Helper `87ca341a2a2279f4c18cd1918c5ae9dbd1dac492`；Prompt Template `d6f520d149aba146305b0b781ddd691d449c28d2`。
- 产品工作分支：未创建；当前阶段文档直接属于长期 `docs`。

### 已完成

- 完成指定入口与调用链的静态研究，区分既有能力、扩展项、新缺口与不继承机制。
- 保存跨模块冻结决策、领域能力模型、权威模块和阶段路由。
- 保存阶段 Record 和单一 live HANDOFF，下一目标明确为 S1。
- 用户已要求停止逐项技术确认：后续只讨论范围、职责和关键取舍。
- 按用户最新要求设置 CP1（S3 后）、CP2（S5 后）与 CP3（最终完成）；每阶段照常验证、记录、推送，中间阶段完成后连续推进。

### 关键决策

以 [decisions.md](../../plans/architecture/native-package-runtime/decisions.md) 为方向权威。最明确的新缺口是 Authority 调用的受限 Package 领域逻辑；其他领域多数复用已有 Native 基础并扩展表达和整合。

### 实际验证 / CI

- 发布检查已通过：9 份文档、33 个相对链接、27 个 main 代码入口及 UTF-8 编码检查；`git diff --cached --check` 通过。
- 本轮重新 fetch 远端 `main` / `docs`；main 仍与研究基线一致。
- 产品测试、构建、运行时复现和新增 UI 验证：未执行，本阶段没有产品实现。
- 正式企划发布提交：`03e52f7eaa2727ae1fc8c4b094a6be76b1432272`；已通过 `git ls-remote` 核对远端 `docs` 指向该提交，远端 `main` 仍为产品基线。本阶段只提交 docs 企划与交接；后续交接状态补记的文档 HEAD 以实际 `origin/docs` ref 为准。

### 限制与下一 checkpoint

能力方向已确定；固定逻辑资源、执行适配、Effect 表达、规则检查位置与具体 Schema / API 尚未冻结。它们是 S1 的设计任务，不是遗漏的方向审批。

下一 checkpoint 为 CP1：从 S1 技术契约冻结连续推进 S2 受限业务逻辑 / Authority 和 S3 上下文 / Knowledge / Task 产物，形成核心运行闭环。每阶段完成对应验证、更新同一 Record / HANDOFF 并推送，S1 / S2 结束后继续；S3 完成后停止汇报。S1 只做设计，S2 才开始产品实现；本轮仍只发布 S0 企划。

## 后续阶段

S1–S6 按 [阶段路由](../../plans/architecture/native-package-runtime/index.md#阶段与按需阅读) 执行；每阶段在本文件追加实际内容、起止 HEAD、实际验证与下一 checkpoint，保留 S0。

## 最终状态

整体任务尚未完成。后续源码实施、验证、main 集成与短期分支清理完成后再补最终状态并删除 live HANDOFF。

## S1 — 技术契约冻结

- 日期：2026-10-06；Start / End 产品 HEAD：`4ac8affbf01bfb5fb576834bb7eedbeefd03c007`。
- 仅静态追读 Authority / Task / SessionCore、Script 编译与 VM、Context / Knowledge / Generation 接点；无产品修改、无产品开发分支。
- 冻结 computation 模块闭包、用途受限同步计算、固定 typed Effects、候选后 invariant、Receipt 隐私、Task uses / production / 跨 Revision 和 once 消费契约；行为矩阵已写入对应模块。
- 实际本地验证：文档相对链接、UTF-8 与 diff whitespace 检查；没有运行产品测试/构建。
- 下一段：S2 固定领域脚本和 Authority 集成，随后 S3；到 CP1 停止。

## S2 — 固定领域计算与 Authority

- Start HEAD：`4ac8affbf01bfb5fb576834bb7eedbeefd03c007`；End / Tested HEAD：`664616b83`；产品分支：`feat/native-package-runtime`，已推送。
- 复用固定 JS/TS 编译闭包和 QuickJS 限制，新增无 Bridge 的同步计算宿主；禁止环境时钟/随机，保留显式 seed。
- Game Logic v3 可选 computation，typed computed 仅进入固定 Resolution / Effect 模板；固定 precondition / compute / invariant，效果后和全部 publications 后双重 invariant。
- Build/Install 强制闭包；Frontend 消耗资源时保留同时属于领域计算的模块。安全 execution 依据随现有 Action Receipt 持久化。
- 本地验证通过：package-computation 16 例、既有 authority-candidate-c2 34 例、authority-resources-c1 14 例，真实 FsEngine / SqliteEngine Session CAS 2 例；触及产品文件 ESLint 和 diff check 通过。首次 integration run 因测试 envelope 缺字段失败，已修正并重新通过。
- MySQL / PostgreSQL 首次连接失败（本机服务未启动）；后续使用现有 disable 开关，仅验证本机 Fs / SQLite。未执行远端 CI、整库测试、构建、UI 或设备验证。
- 限制：40 ms 是 VM 中断 deadline，WASM 初始化及内存耗尽清理有额外耗时，不构成宿主进程 wall-time SLA；S3 接入 Task 真产物和上下文消费，S4–S5 负责编排/作者界面。
- 下一目标 S3，然后到 CP1 停止。

## S3 — 动态上下文、Knowledge 与 Task 消费（CP1）

- 日期：2026-10-06。Start HEAD：`664616b83`；End / Tested HEAD：`10b003f9a2001145b14ae4a40cc731d443ac04d1`。产品分支 `feat/native-package-runtime` 已推送；main 未合并。
- S1 docs 提交：`ac1cea354`；S2 docs 提交：`b6216a882`；本次 S3 docs 以实际远端 ref 为准。

### 完成内容和关键决定

- Task uses / production 保存原输入、生产锚点、定义 hash、视图依赖和 Scope epoch，沿用实际请求/结果/resource refs；保存和消费均检查，typed JSON 不能替代正式 record 引用。
- same_branch 跨 Revision 保留依赖检查，固定领域规则在当前应用基准重算；once 消费与领域效果一起提交，真实 applicationRevisionId 在 SessionCore CAS 发布时填写。保留旧 Task 契约，新的 uses 不获得旧 applyCommand / interpretation 平行写权。
- required context-derivation 与固定 JS/TS 派生进入现有 ContextCompiler / PromptIR，匹配 context-purpose Information audience；派生输出可表达 eligibility / priority / full / compact，固定产物用途受宿主校验。
- 完整 Knowledge selector 接入 Context 主链，展开内容、递归依赖、预算、发现和生命周期参与真实选择；Context 使用现有 Provider tokenizer，最终 wire request 仍有 GenerationService 预算。
- Knowledge pendingState 按既有 targets 分离受众；现代 Task/Turn 只凭内部 result-adoption proof 在正式 CAS 采用，preview 不写入。旧无 taskRuntime Draft 路径保留兼容。
- 复用 Action Receipt / Task record / 有效请求快照承载固定资源、阶段和产物依据；不新增平行 State、事实缓存或调度。

### 本地最小验证

- 新增 S3 行为：Task 产物消费 13 例、Package Context 派生 6 例、CP1 Fs / SQLite 集成各 1 例，共 21 例通过。CP1 使用本机 HTTP fixture 模型输出，验证正式 Task production → 无关 Revision → 固定购买计算 → Narrator → 一次 CAS；动态 Knowledge 进入真实请求，preview 不发送/写入，once/retry/伪造/错用途/依赖变化得到明确拒绝。
- 随触及面执行并通过既有 ContextCompiler 14 例、Knowledge selection 5 例、Task P3 36 例、Prompt P3 46 例、Session projection 49 例、Authority Turn 24 例；S2 测试证据保留在上节。
- 最后 Provider tokenizer 增量后再次执行 CP1 2 例 + Prompt P3 46 例，48 例通过。全部触及产品 JS 文件 ESLint、git diff / staged whitespace 检查通过。
- 调试中修正新 fixture 的 artifact 参数和 context envelope；两份现有 P3 fixture 缺少已存在的 exact resource closure / runs port，补齐真实宿主输入后通过，没有放宽产品校验。
- 全程本地、最小相关验证；未执行远端 CI、全库测试、产品构建、浏览器 UI、Android 或真机。MySQL / PostgreSQL 本机没有运行服务，未算通过。

### CP1 状态、限制和下一目标

核心闭环完成且产品/docs 推送，按任务约定停止。S4–S6 未开始；没有提前合并 main 或删除开发分支。

宿主 QuickJS 的 40 ms 是 VM 中断 deadline，初始化/内存清理另有耗时。原子承诺仅限单 Session Revision；跨 Session / Realm / 外部系统不属于本次原子证明。复杂计算当前接收既有 Lifecycle grants / 真实 Task 结果，World 的写与 Reducer 保持原路径。细致跨域编排、Processing、作者表单和视觉诊断属于 CP2 / CP3。

下一段从 S4 Experience / Lifecycle 编排连续推进 S5 Processing / 作者工作流到 CP2；按 index 仅读指定模块，不重做 S1–S3。

## S4 — Experience / Lifecycle 编排

- Start HEAD：`10b003f9a`；End / Tested HEAD：`bffd30f3d`，产品分支沿用 feat/native-package-runtime。
- 固定 Lifecycle Bridge 支持工作流推进/取消、时钟和 proposal 接受；复用原 action、Controller、Task scheduler、Scope、CAS 与 Authority-first Tool 路径。
- outbox 保存真实触发 Revision / Branch / invocation，Task 保存宿主派生的生命周期原因；外来 cause 不得冒充，旧记录仍兼容。
- 本地验证：新增 CP2 Experience 1 例，既有 Frontend Bridge 16 例、Lifecycle scheduler 6 例、Lifecycle runtime Fs/SQLite 108 例、Authority Turn Fs/SQLite 24 例通过，共 155 例；触及 JS ESLint、diff whitespace 通过。新 fixture 的冻结对象与表达式格式错误已修正并复验。
- 未运行远端 CI、整库 tests、构建、浏览器或设备测试。每阶段只做本地相关验证。
- S4 已完成，按用户授权继续 S5，CP2 才停止；不合并 main。
