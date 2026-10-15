# D5 已冻结：语义 PromptIR、Provider Lowering、冲突诊断、缓存和预算

> **D5 冻结：S2 + L2 + D2 + K2 + T2（2026-10-15）**。本模块为第五轮唯一详细设计与未来 E0 证据清单；D1–D4 延续。**仅冻结文档语义，不代表 Native Schema、Provider/模型、缓存/成本或客户端验证已通过。** 保留单 Native Host、原 PromptCompiler/ContextPort/ProviderPort/RunControl/Experience/Eval 权威，不另建执行器/存储/预算账本。

## 1. 实际代码线索与明确的未完成项（静态）

| 已有代码/文档 | 目前真实事实 | D5 待解决 |
| --- | --- | --- |
| `src/native/model-prompt-runtime/prompt-compiler.js`、`contracts.js` | PromptIR v1 由 `directives/contextSlots/history/input/responseDirectives/tools/outputContract/prefill` 组成；编译模块 decisions/provenance 有记录，Program supports parentRef/derive | IR 主要是已分位置的字符串，尚没有完备 source trust/agency/role 意图的强类型语义块；不能把 D5 的新字段描述成已存在 |
| `src/native/model-prompt-runtime/prompt-renderers.js` | `contextSlots` 被渲染为 `role:'system'`；非尾部系统块会使部分 Anthropic/Gemini fixture 明确拒绝 | 需要做受信/不可信 data 来源提升审计及不同 Provider 的 role/ordering lowering，**不是已证实漏洞或授权可用的 role 越权** |
| `generation-service.js` | 每次 Route 都解析/重新构造 ContextPlan + PromptIR、调用对应 Provider `countTokens`、再 `renderRequest`；有 output reserve、capability requirement 和 fallback 稳定性保护 | B2 Node Program/Route 身份与 fallback 守恒仍待接线；计数/发送同一 wire 的一致性与 Source currentness 需实测 |
| `compiled-binding.js`、`execution-evidence.js` | 已有 source/resource/generation/tools/history/prefix/rendered fingerprints，源码明确这些**不是 Grant，也不能证明 Provider cache hit** | 只能作为可重现诊断键、失效证据的候选，真实缓存需 Provider usage/TTL/capability 支持 |
| `http-generation-provider.js` | OpenAI-compatible provider 配置 token encoding，按已渲染 wire 计数并加消息 overhead；有 sampling/tools/JSON schema/cache 控制的适配检查 | token 精确程度/网关差异必须按真实 Provider 验证，不能把 `tiktoken` 推断成所有模型精确 tokenizer |
| `responses-generation-provider.js`、`native-messages-provider.js` | OpenAI Responses/Anthropic/Gemini 有各自 wire；部分 Token 预检使用 utf8 bytes+margin 的保守上界；缓存控制与 continuation 也不同 | Provider 特定 Role/System、prefill/tool、reasoning/cache 参数要验证受限能力与真正成本 |
| `public/scripts/native/context-compiler.js` | 原 Context lanes/minima/caps/safetyMargin 与 Token 选择 | D5 不建另一个 Context selector；整合 Context 预留与最终 Provider wire 计数 |
| V3 `Node/ModelPort` | 当前 Node 的 Program 独立选择仍为 D4 的**实际接口 gap** | D5 只能规定下游 IR/Lowering 合同，不能以 D5 实现宣称 D4 已跑通 |

## 2. S：原生 PromptIR 的语义结构

| 候选 | 设计 | 取舍 |
| --- | --- | --- |
| **S1 现有字符串 IR 加少量元数据** | 维持 `directives/contextSlots` 的位置与角色，添加来源 labels | 成本低，但仍容易把低信任来源混为 system 语义 |
| **S2 现有 Compiler 内部扩展 Typed Semantic Blocks（已选）** | 在**同一** Native Compiler 的语义层保留 `source/ref/instruction-or-evidence/audience/authorial-purpose/target/order/volatility/required` 等类型与归属，经校验产出单份有效 PromptIR → Provider wire；真实字段到 D5 后 E0 冻结 | 更利于精确继承、E2 文学控制、K2 反全知、D4 Node Program 与来源诊断；不建立另一套外部持久化 IR/Compiler |
| **S3 独立 Behavior DSL/IR 引擎** | 在现有 IR 上新增完整元语言和运行时 | 双语义真相、执行绕路、维护和权限负担大，不建议 |

S2 的 `SemanticBlock` 只是**设计例子，不是已实现接口**，不允许自己申报 Host/World Authority。相同作者文本按 exact revision 版本化；World/Memory/Tool/检索等只能作为低信任证据，经原 C2 先行授权和 K2 Display gate 才可使用。合法作者指令不需要伪造 Provider system 身份才能具有产品内的创作权威。

## 3. L：跨 Provider 模型语义 Lowering

| 候选 | 设计 | 取舍 |
| --- | --- | --- |
| **L1 强行统一消息列表** | 所有 Provider 都直接使用同一组 system/user/assistant message | 简单但与 Anthropic/Gemini/Responses role 和中间 system 条件冲突 |
| **L2 原 ProviderPort 的可验证 Capability-aware Lowering（已选）** | 用同一有效 IR，按 Model/Connection/Route 的已证 capability 做受信角色、tool/JSON/prefill/reasoning/cache 映射；不支持/未知必需能力则拒绝或要求明确作者决策；可选经版本化的模型定向表达覆盖 | 兼容多 Adapter 的现有边界与 D2 R3，不能把任意 data 升格为 system 来凑合法消息格式 |
| **L3 自动 LLM 改写每个 Provider Prompt** | 发送前让另一个模型无监督重写作者规则 | 难复现、费用更高、破坏作者自由文本与 G1 稀疏运行，不建议 |

L2 的降级仅限不改变 Authorial Intent、Agent OutputContract、Context grants、Tool/Model权限和文本核心语义的**显式受支持差异**；Role/system 能力缺失若无法无损表示就按合同 fail-closed，而不是临时改写成“普通用户说系统命令”。Provider 内容拒绝不是传输 fallback，**不得自动切换到另一个供应商规避**；普通网络故障 fallback 仍须守护 D4 已冻结的有效 Program 身份/原 Native send 规则。缓存/Role/JSON schema 适配要比对 final wire，禁止仅用 prompt 字符串作为来源证据。

## 4. D：冲突诊断与可解释降级

| 候选 | 设计 | 取舍 |
| --- | --- | --- |
| **D1 只做语法/引用检查** | 只诊断缺资源、类型、stage 和条件 | 已有基础，无法解释 Narrator Voice/E2、授权与模型 role 冲突 |
| **D2 分级 deterministic checks + 可解释文学警告（已选）** | 区分 hard-invalid、needs-author-choice、soft-style-warning；给出来源、精确 ref/阶段/角色和可采取动作；模型主观文风分歧进入有条件的 Experience/Eval，不强制自动改写 | 延伸已有 Compiler diagnostics，不建重复 Judge |
| **D3 每次编译强制模型裁判** | 编译调用 LLM 评估语义矛盾并重写 | G1 被打破、成本高、可能把成人向文学表达意外归为违规或保守化 |

D2 必须把**不可被文学优先级补救**的硬问题分开：无 Scope/Source/Display grant、Tool/Output contract 权限不足、Program exact ref 不匹配、变量类型错误、Provider 必需 capability 不支持、final wire 超上下文、Node/Route program 语义漂移。风格层如“冷峻叙述 vs 温柔旁白”可以按显式 E2 叠加先后作决策并展示 diff；未有源的自由文本冲突只提示“可能冲突”，不把字符串比较宣称成文学逻辑证明。

## 5. K：缓存布局与真实利用

| 候选 | 设计 | 取舍 |
| --- | --- | --- |
| **K1 现有纯 Prefix 指纹** | 根据现有 compiledBinding/hash 判断哪些片段可能稳定 | 成本低；不保证达到 Provider 真正可缓存前缀 |
| **K2 版本/信任域分区的 Stable→Dynamic 布局（已选）** | 作者/Program exact refs、稳定 Tool/Output schema 和固定指令尽量前置；Source/Actor/Scene/Branch/Turn/context 请求动态部分后置；重用需 Owner/Audience/Route/Model/Capability/TTL/grant/Source validity 真实匹配；用 Provider 实际 usage 测命中率与写入成本 | 与长会话性能、隐私隔离、Provider 能力差异一致；可能需对当前 Render 的中间 system 和 Prompt ordering 做受信调整 |
| **K3 跨 Actor/角色/模型语义相似直接重用** | 不论受众只要文本相近就认为可用 | 会串 NPC 私密 Context、错误复用不同来源/模型；不建议 |

**现有 fingerprint 是诊断，不是缓存许可**；应用/编译 memoization 与 Provider prompt cache、历史结果重用是不同东西，不能用同一个 hash 证明安全。Stage/Module 更改必须导致有效内容/版本失效。OpenAI/Anthropic/Gemini 对前缀、breakpoints、token 长度、TTL、价格与参数的支持不同；cache-control 不适用时不应伪造收益或为撑足阈值塞重复 Prompt。作用域必须避免多用户/多角色的信息关联与侧信道。

## 6. T：Context 和实际请求的预算闭环

| 候选 | 设计 | 取舍 |
| --- | --- | --- |
| **T1 只统计 Prompt 文本长度** | 近似 token 估算，不计 Tool、History/结构化输出、reasoning/output reserve | 易实现但对 Provider/长 RP 不可靠 |
| **T2 原 Context 预分配 + 每候选 Provider wire 再计数（已选）** | 先由原 Context Compiler/RunControl 分配合法 evidence/minima/caps/safety margin，然后经真实 ProviderPort 的 `countTokens` 对 final wire（含工具/JSON schema/前缀/输出预留）核算；每次 fallback route 必须重新计数、校验 capability 与经济预算；另记录缓存真实 usage，不把 cache hit 预估当准入余额 | 复用现有两条路径并补足 D4 binding/currentness/evidence 一致性，绝不新建预算账本 |
| **T3 预测模型弹性超配 token** | 先猜平均缓存命中/压缩效果再允许超出 Provider context | 带来发送失败、超预算和历史完整性风险，不建议 |

T2 需分别报告 context candidate/selected/prompt-prefix/tools/output reserve/provider final input/actual usage；Token 估算是**计数方法的证据等级**，不是“精确”保证。对 Anthropic/Gemini 等采用 byte upper bound 的现行 adapter，应如实说明是保守上界，允许按真实 Provider 可用 token-counter 升级；不能把本地 `cl100k_base` 强用于所有模型。Model 容量之外还有 V3 父子 Run 费用与调用次数，按原 Native Compute/TaskScheduler admission，不因缓存预测或文学质量调优透支账本。

## 7. 第五轮组合、保证级别与最小未来验收

**已正式冻结 S2 + L2 + D2 + K2 + T2（设计层面，所有功能验收仍 NOT_RUN）。** 仅深化原 PromptCompiler/ContextPort/ProviderPort；D4 Node Program/Route 的真正 Host-only 执行接口仍需要 V3 未来实现并实际验证，不能把语义 IR 决定当作 Node 已可执行。

未来定向验证（全部 NOT_RUN）：

1. **信任/role**：合法 Authorial Instruction 与 World/Memory/Tool 文本同题材互不冒充；contextSlots 的 system 位置审计、Anthropic/Gemini 中间 system 约束、Provider required role 不支持必须有确定行为；具体 Browser/Node/Source grant 需真证据。
2. **E2 表达冲突**：Narrator 热烈、NPC 克制；Scene overlay 可改变节奏但不重写人物 Identity。带自定义完整作者文本的 F2 round-trip 不丢字节。
3. **Actor K2/Player A2**：同一秘密不同 Actor/Audience/Display grant、分支撤回与 delayed send；玩家未授权动作/同意不被 Prompt 的强度覆盖。
4. **B2/C2 + fallback**：同一 Route 不同 Node Program，同一 Program 不同 Model Route；正常/故障 fallback 皆保持有效 Program/Tools/OutputContract/预算；Route Program mismatch 不允许静默选择旧 Prompt。
5. **缓存与计费**：同一 stable prefix 多回合对照、前缀变化/Model 切换/受众变化失效、真实 cached tokens/缓存写入成本；缓存作用域不得跨 Actor 泄密，不能以统计缓存预测作为收费准入。
6. **负面证据**：Provider/Tokenizer 不支持、Context 超限、Prefill/Tool/JSON 不兼容、源权限撤销、成本不足都应 fail-closed/用户明确选择；记录失败，不声称实验通过。

来源仅供 D5 架构取舍，**不是 Atria 当前实测证明**：
- [OpenAI Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)：前缀/breakpoint 与 Provider 上报使用量；不同模型能力变化需要动态验证。
- [Anthropic Prompt caching & tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching)：tools→system→messages 的缓存层级、工具变化导致的前缀失效。
- [Gemini Context caching](https://ai.google.dev/gemini-api/docs/caching)：implicit/explicit 模型及 API 差异、usage metadata，不应宣称所有型号都支持相同模式。
- [OpenAI Reasoning](https://developers.openai.com/api/docs/guides/reasoning)：opaque reasoning continuation 保留协议身份，不等于可任意跨 Actor/Branch 使用的公共上下文。

## 8. 已冻结但未实施的接口缺口与验证义务

- **来源与系统消息**：当前 `context-providers.js` 的非历史 `context.fact` 可经 `PromptCompiler.contextSlots`，由 `prompt-renderers.js` 以 `role:system` 渲染。S2/L2 必须在真实 Source → IR → Provider wire 验证下区分 Host instruction 与低信任 Context/Memory/Tool evidence。**这是待审查的信任边界，不是已确认漏洞、也没有修复证据。**
- **B2 Host Program 接线**：V3 `agentPinId/dependencyPins` 只是资源 pin；原 `RuntimeRoute.promptProgramRef` 仍决定 Resolver 返回的 Program，未证实 Node 可在正式发送端独立覆盖。任何未来内部扩展必须保留 Host/Source/Role/Program closure 的精确授权，不开放 Browser 任意覆盖。
- **Fallback**：`GenerationService` 在候选 Route `promptProgramRef` 不同时返回 `generation_semantic_authority_changed`；B2 需真正保持受信 Node Program 与工具/输出合同、逐候选编译和预算。不能通过关闭报错伪称支持多模型。
- **Provider/Token/Cache**：OpenAI-compatible 的指定 tokenizer 与部分 Adapter 采用的保守 byte upper bound 不等价。实际 role、prefill/tools/schema、final wire 计数、cache TTL/cached tokens/cost 与动态 source 失效全部需要运行证据。既有 Prefix 指纹仅为诊断 hash。
- **体验/质量**：Narrator/Actor/Agent 分层、成人虚构创作误拒、反全知/玩家自主权、长会话剧情与成本效益需由原 Experience/Eval 和真实端侧消费者验证；G1 单 Narrator 不能无故多一次模型调用。
- **当前范围**：本轮不批准产品实现分支，不修改 `main`，不保留 ST 旧数据/API/Workspace/mode 兼容。Windows/CachyOS Linux/Termux、Browser、Node、Provider 调用/CI 均未运行，不能标 PASS。

第六轮 [Context/Memory/Cognition](context-memory-consumption.md) 只讨论合法来源的 Prompt 消费和长会话保真，不重建 HCM-01–08、V3 C2 或 Context Compiler。
