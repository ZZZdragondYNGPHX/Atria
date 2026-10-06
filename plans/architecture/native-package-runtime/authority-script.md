# Domain Authority、State 与受限业务逻辑

本模块拥有 Package 领域契约、Authority 调用的脚本、读取和候选状态边界。跨模块冻结决策见 [decisions.md](decisions.md)；Task 来源及消费规则由 [context-generation.md](context-generation.md) 拥有。

## 原生目标

让 Package 实现复杂战斗、交易、任务、掉落、NPC 业务算法，同时让正式合法性与提交始终可由 Atria 强制。调用者表达业务操作，平台装载固定规则执行并接受或拒绝结果。

## 契约的最小责任

以下是需落实的概念责任，不是已冻结字段或接口。

| 概念 | Package 提供 | Atria 强制 |
| --- | --- | --- |
| Command / Intent | 操作语义、参数 Schema、获准入口与能力需求 | 请求身份、权限、输入与固定操作绑定 |
| Rule Binding | Logic、检查器、Reducer 和依赖正式资源 | 精确 Package 版本与资源闭包，防止调用者替换 |
| Execution Context | 所需领域读范围和已捕获输入 | Session / Branch / Revision、消费用途、访问与资源预算 |
| Precondition | 执行前的领域条件 | 在权威输入上运行固定检查 |
| Domain Logic | 算法与候选领域结果 | 受限执行、捕获结果与错误，隔离正式写入 |
| Candidate Effect | 允许变化类型、范围与固定应用规则 | 在私有候选中应用并检查 Effect 边界 |
| Invariant | 整体候选必须保持的游戏约束 | 对正确范围强制检查，失败不发布 |
| Commit | 本次操作需要一起成立的结果 | 并发、身份、领域与平台校验，正式发布或拒绝 |
| Revision / Receipt | 需要说明的领域结果 | 关联规则/状态依据、处理结果和正式版本，支持重复请求识别 |

## 读权限与正式归属

复用现有领域 Schema、Lifecycle Scope、Information View 和 Continuity。统一描述数据归属、生命周期、版本与允许用途；不复制旧插件 global / local / message 变量层级。

正式事实、临时派生、Task 产物和 UI 局部状态需要可区分的身份。具体 Scope、查询与视图形式由 S1 及相应阶段确定。脚本只能获得当前用途获准的输入；领域计算的私有读权限不能自动流向模型、玩家呈现或 Receipt。

正式状态由所属 Authority 管理。任何数据存储便利层都不能形成绕过领域请求的平行写入口。

## 受限执行与固定资源

优先复用 Native Script Runtime 的受限执行、预算、固定模块与 Bridge 机制，并验证 Authority 宿主所需适配。UI Controller 的现有上下文不能直接扩大成领域权限。

执行前解析固定逻辑与依赖，校验输入与读取授权；执行中限制工作、内存、输出及宿主访问；提交前强制候选边界、领域不变量与平台并发检查。

固定规则可以使用声明式或受控脚本。算法和复杂谓词不强制进入 JSON DSL。模型或外部数据先由显式任务捕获；计算准备过程不获取 provider、scheduler 或正式提交句柄。

## 私有计算、候选应用与正式提交

复杂算法可以修改其局部工作模型。Authority 的候选状态只用于当前受控准备过程；正式 State 只有提交后才具有事实身份。

内部 Patch 或差异可以是固定领域应用的实现细节，不能成为调用者的任意正式写授权。正式候选必须来自获准规则和效果应用，不能把脚本修改后的任意完整对象直接覆盖正式 State。

复用现有 Event / Rule / Reducer、App Command、时钟和 Workflow 准备机制。Effect 粒度由领域意义决定；不要求所有变化都是 World Event，也不要求记录每个算法中间变量。

一次交易的付款、库存、发货等相关变化应在平台支持的同一次正式提交范围内校验和采用。检查范围、是否需要中间检查点、跨领域原子边界由 S1 明确；不能将单个 Session 候选过程泛化为跨 Session 或外部系统的全局原子保证。

## S1 必须形成的技术设计

1. 固定 Logic / 检查 / 应用资源的身份和依赖闭包，及其与当前 Package、Session、State Revision 的绑定。
2. 受限执行适配、授权读取和宿主能力；对既有 QuickJS / Bridge 复用与宿主差异给出证据。
3. Command 输入、Precondition、Logic 结果、Effect、Invariant 和 Receipt 的具体契约。
4. 局部工作模型与 Authority 候选能力的接口，禁止直接正式写入的强制位置。
5. 检查时机、候选范围、冲突、重复请求、错误/超预算和无变化结果的正式语义。
6. 与 Task 真实结果引用的接点及最小可贯通 Package 场景；其他模块技术选择仅在依赖需要时细化。

这些是 Agent 的设计任务，不是逐项人工确认清单。冻结边界不变时自行选择并回写；实质取舍变化才讨论。

## S2 实施与验证

从现有 Authority Transaction 和 Package Logic 入口扩展，保留 SessionCore 正式发布 Authority。用最小 Native Package 贯通复杂算法和领域操作，再扩展算法广度。

验证至少覆盖：

- 同形合法 Schema 输入却违反领域条件时被拒绝；调用者不能替换固定 validator / Logic。
- 脚本无法直接写正式 State、访问未授权输入或扩大 Effect 范围；失败与超预算不留下正式残留。
- 购买成功时付款、库存与物品一起成立；任一相关条件失败时不部分提交。
- 版本冲突、重复请求和 Scope 改变得到明确结果；随机等执行依据可追踪。
- Receipt 和可见结果符合用途边界，私有读取不会经默认输出泄漏。

## 起读代码

`src/native/authority-transaction.js` → `task-authority.js` → `session-core.js` 的相应准备/提交函数；`public/scripts/native/experience/logic/package.js`、`transactions.js`、`runtime.js` 及相应 Validator / Reducer / World 候选路径。输入视图从 `public/shared/native-information-runtime.js` 按需追踪。

锁定证据和分类见 [research.md](research.md)。本模块在 S1 结束时补上技术契约，当前不声称已确定 Schema 或执行载体。

## S1 冻结技术契约（2026-10-06）

### 固定资源和执行

保留 Game Logic v3 JSON 声明入口；Transaction 可选 `computation: { source, outputSchema }`。`source` 是 Package source 中精确 JS/TS 路径，静态相对 import 的闭包在 Build / Install 校验，运行只使用已安装 PackageVersion 的 bytes。复用 `compileController` 的语法限制、TS 转译、闭包和 sourceHash；Authority 使用独立 QuickJS 计算宿主，不复用 UI Controller bridge 权限。每次执行新 VM，沿用 8 MiB heap、256 KiB stack、40 ms 中断和模块/输入输出字节上限；无网络、模型、调度、文件、提交句柄、Date 或环境随机。固定输入包含可追踪 seed，Package 可实现自己的纯确定性算法。

模块 default 对象必须提供同步 `precondition(context)`、`compute(context)`、`invariant(context)`。检查严格返回 boolean，compute 严格返回 outputSchema 内的 JSON；Promise、非 JSON、超预算和异常拒绝。输入深冻结，算法可创建私有可变副本。precondition / compute 读取 `{ args, reads, artifacts, seed }`；invariant 读取同一 grant 的候选后视图，另带 `beforeReads`、`computed`、`resolution`。不向模块提供整个 State。

### 固定效果及提交

`computed` 成为固定 Resolution / Effect 模板的额外类型化根；模块不能返回任意 Patch、目标或宿主调用。复杂算法输出中间值，固定模板选择与调用现有 typed World Event / App Command / clock / workflow。声明式 validators 继续执行前检查。所有效果及其 Rule / Reducer 扩展在私有候选执行，invariant 在相关效果后及正式准备结束前执行，平台 Lifecycle / Schema / Scope / retention 检查继续有效。

原子边界为一次 Session Revision，复用 SessionCore 发布锁和 CAS。无变化也是成功操作，可随 narrative / receipt 发布一个 Revision；失败不发布。旧 identity / inputHash / ordinal 和 provider retry 语义保持；任何规则依赖变化会改变固定 resource fingerprint，Receipt 增加不含私有输入的规则/资源依据与阶段证据。Receipt projection 仍只允许 args / public resolution，不默认暴露 computed 或 reads。

### Task 引用接点

Transaction 可选 `artifacts`，每个 grant 声明本地 id、固定 taskId / variantId / usageId，以及由类型化 args 得到的 invocationId。Task resultPolicy 的 `uses` 定义 purpose（rule_input / operation_proposal / context）、reuse（same_revision / same_branch）、cardinality（once / reusable）、Information 依赖 viewIds 和 Lifecycle scopeIds。缺声明不能消费。实现细节及产物身份的唯一权威见 context-generation 的 S1 契约。

### 最小行为矩阵

| 场景 | 必须观察到的行为 |
| --- | --- |
| 购买、批量排序/定价 | 固定脚本计算，钱/库存/交付同次候选及提交 |
| Schema 合法但余额不足 | precondition 拒绝，原状态无残留 |
| 最后 invariant 不成立 | 前面的候选效果全部丢弃 |
| 未授权字段、caller validator / source | 不提供字段或拒绝请求，不能扩大读写范围 |
| 无限循环、内存、Promise、坏输出 | 有界拒绝且不发布，错误不泄漏输入 |
| 重试、换 Branch / Revision、并发 | 同锚点 deterministic，冲突保持现有 CAS 语义 |
| Task 伪造 / 编辑 / 错用途 / 重复消费 | 按正式来源和 uses 拒绝 |
| 私有读取 | 不进入默认 Receipt / 模型 / 呈现 |

静态证据：`authority-transaction.js` 已通过 privateReads / budget / candidate 准备，`task-authority.js` 已精确装载 sourceFiles，SessionCore 负责唯一发布；`frontend/script-compiler.js` 已提供纯模块编译闭包，`frontend/script-vm.js` 提供可复用 QuickJS 限制与动态 constructor 封堵。S2 只扩展这些路径。
