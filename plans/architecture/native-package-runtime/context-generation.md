# 上下文、Knowledge、Generation 与 Task 产物

本模块拥有获准数据的上下文派生、知识选择、Prompt 组合、显式模型任务，以及 Task 来源和消费规则。读取与正式提交依赖 [authority-script.md](authority-script.md)，跨模块边界见 [decisions.md](decisions.md)。

## 上下文计算

扩展现有 Prompt Program / Module / PromptIR、条件、插值和阶段产物能力，支持作者从获准视图、历史、资源和有效产物派生数据与片段。

声明式契约表达输入用途、版本、依赖、输出和预算；普通条件与组合保留直接声明，复杂聚合、排序和片段生成允许受限脚本。执行基础和读取机制优先复用原生能力，避免按每种消费用途建立平行 Script 系统。

计算保持正式 State 只读。游戏伤害、价格和条件等领域结论优先消费固定规则的结果、正式状态或 Receipt；上下文负责选择与表达，不能以另一个模板规则系统代替 Authority。

## Knowledge 查询、选择与内容

区分候选资格、发现/激活、关联依赖、内容派生、预算取舍与实际采用。复杂条件或排序可以可编程，但受明确授权、执行和输出边界约束。

复用当前完整选择器的发现、生命周期、递归依赖和 full / compact 预算能力，整合原生 Context 主链。动态计算的实际内容进入组合预算，再由 Generation 检查最终请求预算；预览与真实发送使用一致的准备依据。

Knowledge 正文是内容资源；可执行派生逻辑来自获准固定资源。特殊标签、disabled 反转或文本内代码不承担隐式运行调度。

黏滞、冷却等持久选择状态由所属 Authority 在相应结果正式采用时提交。查询、计算、预览、重试和重新渲染只生成候选选择；采用范围和并发语义在技术设计中明确。

## 显式 Generation / Task

复用现有 Route / Model / Generation Profile、Capability、有效请求快照、Task 类别、Schema、sink、调度、取消、重试和资源预算。

摘要、语义提取、NPC 决策和辅助生成都通过显式任务/阶段获得结果，再进入后续计算或领域请求。Task 发起者可以是 Experience 或 Package 系统自动化，Domain Logic 的候选计算不直接启动模型或外部 I/O。

Tool 的数据约束、可调用操作与结果用途受平台声明控制；需要正式状态变化的调用转为固定领域操作，其规则与提交由相应 Authority 执行。具体路由由 [experience-processing.md](experience-processing.md) 拥有。

## Task 来源与消费

需要分别识别生产计算、结果保存和正式领域应用。生产依据包括真实生产者、规则/资源、输入和状态来源；应用依据是消费操作的正式锚点。保存结果不表示其中内容已成为游戏事实。

| 消费用途 | 行为 | 强制边界 |
| --- | --- | --- |
| 上下文 / 呈现 | 提供摘要、描述或报告 | 获准用途和受众，不自动改写正式领域状态 |
| 操作提案 | 提议 NPC 行动或业务操作 | 映射到获准 Command，重新检查当前领域条件并计算结果 |
| 规则输入 | 固定玩法使用模型评分或判断 | 读取获准 Task 的真实产物，固定规则解释其游戏意义 |

Schema 合法不能证明来源。编辑、转换和组合应保持派生身份，不能冒充原始正式结果。产物引用与权限必须由平台验证，不能只采信调用者携带的 JSON。

跨 Revision 复用依赖固定契约的用途、有效条件和复用规则；没有契约则不能自动接受。消费时重新执行当前规则，不重放旧 Effects。生产阶段有效性检查不因允许跨版本消费而失效。

源记录的依赖指纹、Scope 变化、分支/Session/Package 边界、消费次数、过期与保留语义由技术设计确定。复用既有 Information 来源指纹和生命周期能力，避免另建无权威事实缓存。

同一请求的重试幂等与同一产物的多次消费分别处理：摘要可被多个请求引用，一次奖励类结果须满足其消费约束。

## 技术设计与阶段交付

S1 先落实领域契约需要的真实 Task 引用与消费接点；S3 完成派生计算、Knowledge 主链、阶段产物编排与细粒度有效性。

具体查询接口、产物引用、依赖模型、随机/时间输入、缺少产物时的预览行为和缓存形式均由 Agent 推导。需要模型计算的预览准备应呈现为显式任务，不由模板求值暗中发送请求。

## 行为验证

- 在同一组固定输入与产物下，预览解释与实际请求准备一致；预览不写正式 State、不隐式发送模型请求。
- 一个动态知识条目展开超出预算时，最终选择与请求检查正确，依赖不会残缺进入请求。
- 获准的无关 Revision 变化允许按契约复用；目标消失、Scope 改变或领域条件失效时，当前操作被拒绝或产生明确处理结果。
- 伪造同形 Task JSON、越过用途授权、编辑结果冒充原产物，以及重放旧 Effects 均被拒绝。
- 敏感读范围、模型上下文与玩家呈现按用途分离；持久知识状态只随正式采用提交。

## 起读代码

`src/native/model-prompt-runtime/prompt-compiler.js`、`prompt-values.js`、`generation-service.js`；`public/scripts/native/knowledge-runtime.js`、`knowledge-selection.js`、`context-compiler.js`；`src/native/adapters/generation-host.js`；`public/shared/native-task-contract.js`；`src/native/task-scheduler.js`；`session-core.js` 的 Task 保存与 proposal 应用。

模型与资源解析说明先按需读 `src/native/model-prompt-runtime/README.md`。锁定证据见 [research.md](research.md)。

## S1 冻结：产物身份与消费

正式 durable Task record 继续保存在 `atri_task_results`，由现有 GenerationHost → SessionCore 路径保存。新增 production 依据：Session / PackageVersion / Branch / 生产 Revision、原始输入、Task 定义 hash、有效请求/结果 hash、uses 所需 Information 投影 fingerprint 和 Scope epoch。记录不把模型结论直接变成游戏事实。

消费者只给 invocationId；宿主从正式 record 解析并核对固定 task / variant / definition、normalizedResultHash、production 身份、declared usage、scope active + epoch、依赖 fingerprint。投影 fingerprint 排除顶层当前锚点但保留真实来源身份和值，允许不影响依赖的 Revision 变化；Branch / Package / Session 不允许跨越。same_revision 要求消费发生在保存该产物的 Revision；same_branch 仍强制依赖和当前规则重算。

once 的消费身份写入同一候选 Task record，和领域效果一起 CAS 发布；失败不会消耗。请求幂等继续由 Authority identity / existing receipt 决定，与重复消费独立。编辑后 payload 与原 normalizedResultHash 不符，不再具备原产物身份；旧 Task 无 production / uses 可沿用既有显示和 proposal API，但不能自动取得新的消费权。

S3 将在现有 SessionContextCompiler 中接入完整 Native Knowledge selector；固定 Package 上下文派生只接收匹配当前受众且获 context exposure 的 Information view 和 context-purpose Task references。动态 Knowledge 文本先展开，再执行 full / compact 和依赖预算，最终请求仍由 GenerationService 计数。pending sticky / cooldown 只在相应正式结果采用时随 Session CAS 提交，preview / compile 不写入。

## S3 实施技术契约（2026-10-06）

### 作者派生与 Prompt 主链

ExperienceContract 新增 required `context-derivation@1` 与 `contextRuntime: { schemaVersion: 1, derivations }`，两者必须一起声明。每条 derivation 固定 `id / source / viewId / target / artifacts`。source 是既有 Package source JS/TS 闭包，沿用 S2 的编译和 QuickJS 计算宿主；default `derive` 只接收获 context exposure 的 Information projection、获 context-purpose Task 产物和显式 seed。只执行当前消费者精确匹配的 view；不存在匹配视图时不执行，声明命中但缺宿主/产物则明确拒绝。

`target` 为 `{ kind: context, priority }` 或 `{ kind: knowledge, knowledgeEntryId }`；Knowledge 目标必须是固定 Package entries 中的精确 ID，且对应 view 授予 knowledge。返回 `{ text, compact?, eligible?, priority? }`：文本上限各 32768 字符，priority 为 -10000..10000，eligible 为 boolean，单次编译派生累计 256 KiB。纯派生支持聚合、排序、资格与内容选择；它不能发起模型任务或提交领域变化。基础 Prompt 条件 / 局部参数 / stage artifacts 继续由原 Compiler 处理，派生上下文进入原 ContextPlan → PromptIR → 最终请求，不建立平行 Prompt authority。原局部 Prompt artifact JSON 不是正式 Task 引用。

### Knowledge 选择及采用

SessionContextCompiler 接入 `evaluateNativeKnowledge` 完整主链，保留发现、生命周期、递归依赖、预算 tier 与 full / compact。先展开实际文本，再按依赖 bundle 计数；动态 eligible 和 priority 进入同一选择器。最终 Context 分配仍保持依赖原子组，并只为实际纳入的条目建立新的 sticky / cooldown。preview / send 共用准备路径，概率使用当前固定快照的 deterministic seed。

已有 HTTP Provider 提供对应 Model 的 contextTokenizer；OpenAI-compatible 使用配置的编码，Native messages 沿用 UTF-8 byte 上界，最后仍由 GenerationService 对完整 wire request（含工具、schema 和预留输出）计数。没有 text tokenizer 的自定义 port 继续既有估算，最终 Provider budget 强制仍存在。

持久状态沿用 `atri_knowledge_runtime.targets[targetKey]`，Narrator、Actor 和具体 Task 的 target 分离。有效请求快照的 `contextPlan.nativeSelection` 保存派生资源依据、选择/拒绝、pendingState 和实际纳入 identity；它本身不是正式写权限。GenerationHost 在相应结果采用时产生宿主内存中的 proof，SessionCore 验证 core / owner / Session / Branch / Revision 后，与正式 Task / Turn 在同次 CAS 采用选择状态。现代 taskRuntime 的 generic state patch 和旧浏览器 commitKnowledge 均不能代写该 namespace；无 Task runtime 的既有产品路径保留原来的 Draft 采用行为。

### 正式 Task 消费

`resultPolicy.uses` 只用于 durable 未采用 artifact，不能与 turn、app_command sink、applyCommand 或 interpretation 并用。每条 use 定义 S1 冻结的用途、复用、基数、viewIds 和 scopeIds；不存在的依赖 Build 校验失败。GenerationHost 捕获 production；SessionCore 保存前复核定义 hash、输入、依赖、exact prompt/generation ref、规范输出 hash 和 delivery 类型。

Transaction 的 `artifacts` grant 从 args 的 invocationId 解析真实 record；固定源、variant、usage、payload hash、Session / PackageVersion / Branch、Scope epoch、依赖 fingerprint 和 once 历史全部校验。规则输入在私有候选中按固定契约重算，操作提案只能参与其固定 Transaction。Context derivation 的 artifacts grant 为固定 task / variant / usage 加 `selector: latest`，选择最新正式 record 后进行同样校验，不隐式退回过期的旧结果。

once 标记在私有候选产生，SessionCore 发布时填写真实 applicationRevisionId；失败不消耗，重试仍由原 invocation / receipt 幂等。编辑旧 proposal 时保存 derivedResult 的源/结果 hash，不能再冒充原生产 payload。安全产物身份随既有 Action Receipt 持久化；没有复制另一个 Task/事实缓存。

CP1 本地场景已覆盖真实 HTTP fixture 生成 → durable Task → 无关 Revision → 领域计算 → 私有候选 Narrator → 一次 CAS，另有动态 Knowledge 依赖预算、只读 preview、伪造/编辑/错用途/过期和重复消费验证。正式范围仍为单 Session 提交；S4–S6 处理后续编排、作者工作流和最终集成。
