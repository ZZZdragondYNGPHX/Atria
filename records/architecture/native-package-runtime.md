# Atria 原生 Package Runtime 能力体系 — Record

> 历史记录，不是执行清单。当前实现与验证规则见 [Governance §12.2](../../README.md#122-minimal-validation-and-runtime-checks)。

- Task ID: `ARCH-NATIVE-PACKAGE-RUNTIME`
- Primary Workspace: `main`。
- Status: Complete — S0–S6 / CP3 完成，产品已合入并推送 main，任务分支和 live HANDOFF 已清理。
- Plan：[唯一入口](../../plans/architecture/native-package-runtime/index.md)。
- 最终 main HEAD：`ed1fd90521a63363e29856601abbf5e908c99d10`；live HANDOFF 已删除。

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
- 后续讨论集中于范围、职责和关键取舍，不逐项确认技术细节。
- 设置 CP1（S3 后）、CP2（S5 后）与 CP3（最终完成）；

### 关键决策

以 [decisions.md](../../plans/architecture/native-package-runtime/decisions.md) 为方向权威。最明确的新缺口是 Authority 调用的受限 Package 领域逻辑；其他领域多数复用已有 Native 基础并扩展表达和整合。

### 限制与下一 checkpoint

能力方向已确定；它们是 S1 的设计任务，不是遗漏的方向审批。

下一 checkpoint 为 CP1：从 S1 技术契约冻结连续推进 S2 受限业务逻辑 / Authority 和 S3 上下文 / Knowledge / Task 产物，形成核心运行闭环。S3 完成后停止汇报。S1 只做设计，S2 才开始产品实现；本轮仍只发布 S0 企划。

## 后续阶段

S1–S6 按 [阶段路由](../../plans/architecture/native-package-runtime/index.md#阶段与按需阅读) 执行；

## 最终状态

S0–S6 全部完成，停在 CP3。产品 main 已快进至 `ed1fd90521a63363e29856601abbf5e908c99d10` 并推送；本地/远端 `feat/native-package-runtime` 已删除。发布以真实远端 ref 为准。

## S1 — 技术契约冻结

- 日期：2026-10-06；Start / End 产品 HEAD：`4ac8affbf01bfb5fb576834bb7eedbeefd03c007`。
- 仅静态追读 Authority / Task / SessionCore、Script 编译与 VM、Context / Knowledge / Generation 接点；无产品修改、无产品开发分支。
- 冻结 computation 模块闭包、用途受限同步计算、固定 typed Effects、候选后 invariant、Receipt 隐私、Task uses / production / 跨 Revision 和 once 消费契约；行为矩阵已写入对应模块。
- 没有运行产品测试/构建。
- 下一段：S2 固定领域脚本和 Authority 集成，随后 S3；到 CP1 停止。

## S2 — 固定领域计算与 Authority

- Start HEAD：`4ac8affbf01bfb5fb576834bb7eedbeefd03c007`；End / Tested HEAD：`664616b83`；产品分支：`feat/native-package-runtime`，已推送。
- 复用固定 JS/TS 编译闭包和 QuickJS 限制，新增无 Bridge 的同步计算宿主；禁止环境时钟/随机，保留显式 seed。
- Game Logic v3 可选 computation，typed computed 仅进入固定 Resolution / Effect 模板；固定 precondition / compute / invariant，效果后和全部 publications 后双重 invariant。
- Build/Install 强制闭包；Frontend 消耗资源时保留同时属于领域计算的模块。安全 execution 依据随现有 Action Receipt 持久化。
- 首次 integration run 因测试 envelope 缺字段失败，已修正并重新通过。
- MySQL / PostgreSQL 首次连接失败（本机服务未启动）；
- 限制：40 ms 是 VM 中断 deadline，WASM 初始化及内存耗尽清理有额外耗时，不构成宿主进程 wall-time SLA；S3 接入 Task 真产物和上下文消费，S4–S5 负责编排/作者界面。
- 下一目标 S3，然后到 CP1 停止。

## S3 — 动态上下文、Knowledge 与 Task 消费（CP1）

- 日期：2026-10-06。Start HEAD：`664616b83`；End / Tested HEAD：`10b003f9a2001145b14ae4a40cc731d443ac04d1`。产品分支 `feat/native-package-runtime` 已推送；main 未合并。
- S1 docs 提交：`ac1cea354`；S2 docs 提交：`b6216a882`；本次 S3 docs 以实际远端 ref 为准。

### 完成内容和关键决定

- once 消费与领域效果一起提交，真实 applicationRevisionId 在 SessionCore CAS 发布时填写。保留旧 Task 契约，新的 uses 不获得旧 applyCommand / interpretation 平行写权。
- required context-derivation 与固定 JS/TS 派生进入现有 ContextCompiler / PromptIR，匹配 context-purpose Information audience；
- 完整 Knowledge selector 接入 Context 主链，展开内容、递归依赖、预算、发现和生命周期参与真实选择；Context 使用现有 Provider tokenizer，最终 wire request 仍有 GenerationService 预算。
- Knowledge pendingState 按既有 targets 分离受众；现代 Task/Turn 只凭内部 result-adoption proof 在正式 CAS 采用，preview 不写入。旧无 taskRuntime Draft 路径保留兼容。
- 复用 Action Receipt / Task record / 有效请求快照承载固定资源、阶段和产物依据；不新增平行 State、事实缓存或调度。

### CP1 状态、限制和下一目标

核心闭环完成且产品/docs 推送，按任务约定停止。S4–S6 未开始；没有提前合并 main 或删除开发分支。

宿主 QuickJS 的 40 ms 是 VM 中断 deadline，初始化/内存清理另有耗时。原子承诺仅限单 Session Revision；跨 Session / Realm / 外部系统不属于本次原子证明。复杂计算当前接收既有 Lifecycle grants / 真实 Task 结果，World 的写与 Reducer 保持原路径。细致跨域编排、Processing、作者表单和视觉诊断属于 CP2 / CP3。

下一段从 S4 Experience / Lifecycle 编排连续推进 S5 Processing / 作者工作流到 CP2；按 index 仅读指定模块，不重做 S1–S3。

## S4 — Experience / Lifecycle 编排

- Start HEAD：`10b003f9a`；End / Tested HEAD：`bffd30f3d`，产品分支沿用 feat/native-package-runtime。
- 固定 Lifecycle Bridge 支持工作流推进/取消、时钟和 proposal 接受；复用原 action、Controller、Task scheduler、Scope、CAS 与 Authority-first Tool 路径。
- outbox 保存真实触发 Revision / Branch / invocation，Task 保存宿主派生的生命周期原因；外来 cause 不得冒充，旧记录仍兼容。
- 触及 JS ESLint、diff whitespace 通过。
- 未运行远端 CI、整库 tests、构建、浏览器或设备测试。
- 不合并 main。

## S5 — Processing / 作者工作流（CP2）

- Start HEAD：`bffd30f3d`；End / Tested HEAD：`8f86a4e9f8450dc27b3c3d0818adcbd7a1ce4fb3`，产品分支 feat/native-package-runtime 已提交并推送，main 未合并。
- S4 docs：`e14041ce4`；本阶段 docs HEAD 以真实远端 refs 为准。

### 完成与边界

新增 required processing 契约、固定顺序 trim / literal replace / JS/TS transform，复用原 Package computation 闭包 / QuickJS；正文输出在正式 Turn finalize 前处理，Context 仅在获准 recent_raw 候选的计数前处理，Presentation 保留 canonical content 并派生 displayContent。模型/模板字符串无执行权；Task artifact payload 不被自动转换，MessageProjection 与正文不一致拒绝采用，Knowledge 仍复用 S3。旧消息 Bridge schema 保持，新增 presentation 读取和原生 Play 消费。

Studio 在 Runtime Design 使用现有结构化/Source draft，支持 Processor 增删排序与实现字段，经原 Review/ChangeSet 保存。精确已保存 Revision 的 sample preview 通过 StudioService 原项目队列只读执行，拒绝调用者指定 Source 与过期基准。HTTP 失败定位阶段/Processor，不暴露执行输入或异常消息。

### CP2 停止与下一目标

S4 / S5 完成，产品/docs 已推送。沿用分支，不合并 main、不删除活跃分支，停在 CP2。不自动继续。

处理上限和 Scope 见 Plan：输出只接 Turn narrator 正文；上下文接 recent_raw，Information 替代历史不会隐式补读；呈现只接数据式文本派生，复杂呈现仍走已有 Controller/组件。旧 Regex 主链兼容；未声称所有 Processing/设备/外部数据库/跨 Realm 矩阵通过。私有候选/单 Session CAS/Task uses/Knowledge adoption 边界保持。

## S6 — 原生集成与最终完成（CP3）

- 日期：2026-10-06。Start HEAD：`8f86a4e9f8450dc27b3c3d0818adcbd7a1ce4fb3`；End / Tested / main HEAD：`ed1fd90521a63363e29856601abbf5e908c99d10`。
- docs 起点：`0776f01153ee669231bcde93ad1cde64928257d9`。

### 原生场景与完成内容

- 在 Fs / SQLite 各自的独立临时账户存储中 Build / Install 新 Native Trading Package；原账户以 ready 产生 durable NPC outbox，`.atriasave` 导出/导入到新存储。重新创建 Service / Host 后经原 scheduler 调用本机 HTTP fixture，Task 保留真实 production、固定 Package Prompt / Generation 和 lifecycleCause；再次执行 outbox 不重发请求。原账户的待执行意图不受目标执行影响。
- 动态 Knowledge 的 20000 字符展开经真实 Provider tokenizer / Context 主链预算选用 compact “NPC wants 2”；preview 不请求模型、不写状态。私有 notes 不进入有效模型请求；Information 取代 raw history 时，context Processor 不额外读取/改写历史。
- 输出依序 trim / 固定 transform 形成 canonical 正文，presentation 只派生 displayContent。处理脚本失败时正式状态和 Timeline 不变；Narrator 在途期间由并发 clock CAS 推进 Revision，迟到交易被拒绝且无领域/消费/Knowledge 残留；在新基准上重算后成功。原 invocation 重试只读，重复 once 消费在 Authority 准备阶段拒绝且不发请求。
- 新版本安装后原 Session / Save 保持原 packageVersionId；新账户仅有新 Package 时导入旧 Save 明确缺少精确版本，安装原版后恢复状态、正文、呈现和诊断依据相同。
- 第二个真实 Native Package 场景在 Fs / SQLite Build / Install，固定 context Script 在读取原历史后、计数和 HTTP 请求前转换；

### 最终交付与限制

本地/远端 `feat/native-package-runtime` 已删除；Plan 完成状态、同一 Record 和 live HANDOFF 删除随最终 docs 发布。docs 没有接收 main merge，原产品 AGENTS.md 及原 docs README / WEB-PERSISTENT-PROMPT / templates 四项 dirty changes 的字节保持不变，未纳入提交。package / plugin / skills / reference 未读取或修改；未启动子 Agent。

未运行全库测试、产品构建、真正浏览器视觉、Android / 真机 / WebView、外部 MySQL / PostgreSQL、远端模型或远端 CI。Service / Host 重新实例化与跨存储导入证明 durable 恢复，没有声称宿主进程崩溃注入。原子证明保持单 Session CAS；此前 CP2 的 UI 证据仍为 jsdom，本阶段未新增或声称浏览器 UI 证据。

CP3 已完成，任务结束并停止，没有下一实现阶段或接手任务；后续独立工作从本永久 Record 与完成 Plan 读取，不恢复已删除的 live HANDOFF。
