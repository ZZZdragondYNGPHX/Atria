# D5 已冻结：语义 PromptIR、Provider Lowering、冲突诊断、缓存和预算

## 1. 实际代码线索与明确的未完成项（静态）

| 已有代码/文档 | 目前真实事实 | D5 待解决 |
| --- | --- | --- |
| `src/native/model-prompt-runtime/prompt-compiler.js`、`contracts.js` | PromptIR v1 由 `directives/contextSlots/history/input/responseDirectives/tools/outputContract/prefill` 组成；编译模块 decisions/provenance 有记录，Program supports parentRef/derive | IR 主要是已分位置的字符串，尚没有完备 source trust/agency/role 意图的强类型语义块；不能把 D5 的新字段描述成已存在 |
| `src/native/model-prompt-runtime/prompt-renderers.js` | `contextSlots` 被渲染为 `role:'system'`；非尾部系统块会使部分 Anthropic/Gemini fixture 明确拒绝 | 需要做受信/不可信 data 来源提升审计及不同 Provider 的 role/ordering lowering，**不是已证实漏洞或授权可用的 role 越权** |
| `generation-service.js` | 每次 Route 都解析/重新构造 ContextPlan + PromptIR、调用对应 Provider `countTokens`、再 `renderRequest`；有 output reserve、capability requirement 和 fallback 稳定性保护 | B2 Node Program/Route 身份与 fallback 守恒仍待接线；计数/发送同一 wire 的一致性与 Source currentness 需实测 |
| `compiled-binding.js`、`execution-evidence.js` | 已有 source/resource/generation/tools/history/prefix/rendered fingerprints，源码明确这些**不是 Grant，也不能证明 Provider cache hit** | 只能作为可重现诊断键、失效证据的候选，真实缓存需 Provider usage/TTL/capability 支持 |
| `http-generation-provider.js` | OpenAI-compatible provider 配置 token encoding，按已渲染 wire 计数并加消息 overhead；||
| `responses-generation-provider.js`、`native-messages-provider.js` | OpenAI Responses/Anthropic/Gemini 有各自 wire；部分 Token 预检使用 utf8 bytes+margin 的保守上界；缓存控制与 continuation 也不同 ||
| `public/scripts/native/context-compiler.js` | 原 Context lanes/minima/caps/safetyMargin 与 Token 选择 | D5 不建另一个 Context selector；整合 Context 预留与最终 Provider wire 计数 |
| V3 `Node/ModelPort` | 当前 Node 的 Program 独立选择仍为 D4 的**实际接口 gap** | D5 只能规定下游 IR/Lowering 合同，不能以 D5 实现宣称 D4 已跑通 |

## 2. S：原生 PromptIR 的语义结构

| 候选 | 设计 | 取舍 |
| --- | --- | --- |
| **S1 现有字符串 IR 加少量元数据** | 维持 `directives/contextSlots` 的位置与角色，添加来源 labels | 成本低，但仍容易把低信任来源混为 system 语义 |
| **S2 现有 Compiler 内部扩展 Typed Semantic Blocks（已选）** |真实字段到 D5 后 E0 冻结| 更利于精确继承、E2 文学控制、K2 反全知、D4 Node Program 与来源诊断；不建立另一套外部持久化 IR/Compiler |
| **S3 独立 Behavior DSL/IR 引擎** | 在现有 IR 上新增完整元语言和运行时 | 双语义真相、执行绕路、维护和权限负担大，不建议 |

S2 的 `SemanticBlock` 只是**设计例子，不是已实现接口**，不允许自己申报 Host/World Authority。相同作者文本按 exact revision 版本化；World/Memory/Tool/检索等只能作为低信任证据，经原 C2 先行授权和 K2 Display gate 才可使用。合法作者指令不需要伪造 Provider system 身份才能具有产品内的创作权威。

语义编排借鉴 [LoomStudio PromptBuild](https://github.com/The-LoomStudio/LoomStudio/blob/10be7f6e460a19d96fe9a4ca4892234f938b0196/docs/architecture/application/prompt-build/README.md) 的**有序树、Anchor/Slot、独立来源 Contribution 与正文宏分工**，而不是复制它的物理结构。Atria 原生 Program/Stage/Module 与 Compiler 保留唯一顺序和有效内容决定权：需要独立来源、Activation、排序或受众边界的内容可被解释为带 SourceRef 的编译期贡献；只需正文内替换的变量仍归现有 Module 文本/模板处理，不获得新的独立授权节点。

**已选单一显式编排方向**：Program 自身有序 Stage 是阶段先后依据；**同一合法 target 内**，原生 Module 引用与受控 Anchor 共享作者定义的有效顺序；Anchor 是接收获准来源的编排位置，不是单独的 World/Memory/权限数据或可自由下沉的 system 角色。Context Contribution 由原 Host/Context Authority 针对当前请求选择，携带来源和受众证据，按合法位置投影；不是持久的第二套事实库或擅自追加的模块文本。宏仍只展开宿主正文，不参与独立排序。

**与现有实现的差距**：当前 `public/shared/prompt-module-order.js` 使用 `target → priority(desc) → Module ID`，Stage 内 `moduleRefs` 的数组顺序并非发送顺序。实施时必须将作者顺序与编译规则做成一个权威转换，审查 `parentRef/derive` 后的顺序、原生已发布 exact 引用与行为变化，再在前端呈现同一结果；不能保留优先级与“显式顺序”两套冲突的排序机制，也不能把单纯拖拽 UI 宣称为新语义。**继承方向已定为 exact parent + 显式差异**：替换/禁用/配置沿用原有效位置，新增需明确插入点；父修订升级必须显式选择并复审，绝不 follow latest。**请求级动态装配已定为由原 Host/Context Authority 选择**：作者 Stage/Module 条件仅消费合法类型化值；Host 先筛 Source/Actor/Audience/Grant 再给 Compiler，不能凭作者条件扩大读取范围；静态 Program 不被动态来源反向修改。来源类别与必需性是消费声明，不是授权。Host 对每次请求由既有 ContextPlan 派生 Contribution（包含 SourceRef、Audience、currentness/认识地位等已有证据），经确定性顺序、来源去重及必要性诊断再编译；不新增第二存储、深度权重、Role 继承或外部 Pass 引擎。**具体 Stage/Anchor JSON 字段、同 Anchor 的排序键与去重身份规则、继承合并冲突编码及快照端口仍待物理设计确认**，不在此凭空引入数据库表、`localDepth` 或新的 Pipeline。

对照 [Loom Core 集成说明](https://github.com/The-LoomStudio/LoomStudio/blob/10be7f6e460a19d96fe9a4ca4892234f938b0196/docs/architecture/application/prompt-build/loom-core/studio-integration.md)，LoomStudio 的 Agent PromptBuild 使用 Application DFS 编译，通用 Loom Core Runner 是另一条调用链；Atria 因此不引入第二个 Fragment/Pass Runtime，也不声称移植了 Core 的 Trace/Replay 能力。**独立作者测试的正确边界**是：作者无游戏即可持有和编辑原生 Program/Module/Generation exact revision；一旦要求 Authored→Effective→Wire 或付费试读，仍需同一 Native Host 提供受权的明确测试上下文/fixture、真实 Model/Route/Provider capability 和可审计的预算，不将任意客户端构造的 World/Memory/Session 当受信来源。当前正式 Preview 入口要求 Session/Project，独立无游戏测试是待补的产品能力，不许再建 Preview Compiler。图像编辑使用独立 ImagePromptIR、原视觉 Target/Rendering/Job/Asset 权威，不能将生图 style/negative Prompt 强制转换为文本 Module 来获得试生成资格。

**官方默认模板的原生编排原则**：新建可选择短小、可编辑且可导出的通用 Program 骨架，承载身份/任务边界、作者叙事意图、获准 Context 与 History 接入位置、最新输入及输出约束；依原生 Stage/Module/受控 Anchor 承载，不复制 LoomStudio 的物理树、Anchor 名字或其固定 system/developer 消息位置。按用途提供 RP/Narrative（单 Narrator 与角色/玩家边界）、Creative Writing（完整作者表达/文体控制）、Agent Task（任务/证据/输出合同）等少量模板，复用基础语义模块与原 Library exact revisions。视觉 Prompt/风格默认资源归原 Image Rendering/Target、ImagePromptIR 与 Visual Job/Asset，不伪装成 `core.prompt-program` 的 Provider Wire。默认工具、额外 Agent、Judge、收费模型试读和私有来源访问均不自动启用；需要时按受权需求配置。模板只初始化作者选择的新资源，官方模板更新不覆盖旧 Program、已发行预设或冻结中的 Session/Plan/Package。具体模板实体、播种/分发和原生 Schema 待实现审计，不将当前空 `stage.main` 说成已具有官方模板。

## 3. L：跨 Provider 模型语义 Lowering

| 候选 | 设计 | 取舍 |
| --- | --- | --- |
| **L1 强行统一消息列表** | 所有 Provider 都直接使用同一组 system/user/assistant message | 简单但与 Anthropic/Gemini/Responses role 和中间 system 条件冲突 |
| **L3 自动 LLM 改写每个 Provider Prompt** | 发送前让另一个模型无监督重写作者规则 | 难复现、费用更高、破坏作者自由文本与 G1 稀疏运行，不建议 |

L2 的降级仅限不改变 Authorial Intent、Agent OutputContract、Context grants、Tool/Model权限和文本核心语义的**显式受支持差异**；Provider 内容拒绝不是传输 fallback，**不得自动切换到另一个供应商规避**；普通网络故障 fallback 仍须守护 D4 已冻结的有效 Program 身份/原 Native send 规则。缓存/Role/JSON schema 适配要比对 final wire，禁止仅用 prompt 字符串作为来源证据。

**跨 Provider 的单一作者语义**：作者在 Program 中表达一次，原 Provider Adapter 依据 Model/Connection/Route 的真实 Capability 生成各自合法 Wire；不维持 OpenAI/Anthropic/Gemini 等“每家一份默认预设”的平行身份、排序与持久版本。遇不支持或未知的必需能力须拒绝或明确要求作者选择；仅在不破坏授权/原文意图时才允许有据的可选降级。确有需求的模型定向表达使用显式、受限、精确修订的作者覆盖并显示 Effective/Wire Diff，绝不能由另一个模型在发送前自动重写。

## 4. D：冲突诊断与可解释降级

| 候选 | 设计 | 取舍 |
| --- | --- | --- |
| **D3 每次编译强制模型裁判** | 编译调用 LLM 评估语义矛盾并重写 | G1 被打破、成本高、可能把成人向文学表达意外归为违规或保守化 |

D2 必须把**不可被文学优先级补救**的硬问题分开：无 Scope/Source/Display grant、Tool/Output contract 权限不足、Program exact ref 不匹配、变量类型错误、Provider 必需 capability 不支持、final wire 超上下文、Node/Route program 语义漂移。风格层如“冷峻叙述 vs 温柔旁白”可以按显式 E2 叠加先后作决策并展示 diff；未有源的自由文本冲突只提示“可能冲突”，不把字符串比较宣称成文学逻辑证明。面向作者的激活/未纳入原因、最终语义位置和差异必须来自 Host 的有效编译证据；默认不执行模型试读或常驻重计算。编译诊断须区分作者条件不成立、Host 未授权的来源、Anchor 匹配/排序/去重结果、必要上下文缺失与版本/currentness 已过期；可选来源缺失应明示本次未纳入，必要来源缺失必须走原本确定的拒绝或作者处理路径，不能自动让模型编造。对于顺序冲突，至少区分跨 target 的非法移动、同 target 的合法显式排序、未解析 Anchor/Source 和继承后精确引用漂移；诊断不得把尚未实行的新排序表现为当前 Compiler 的真实执行结果。

**可解释编译证据（与 D8 P2/I2 同一合同）**：Authored/Effective/Provider Wire 都来自相同 Host 原生 Compiler/Context/Provider 接口或其受权脱敏投影，不在 Browser 重编 Prompt。有效 Trace 应指出确实参与计算的 Stage/Module/Anchor、条件成立与否、纳入的 Contribution 来源、最终目标位置、实际 Provider lowering 和未纳入/失效的可披露原因；来源未查询、权限未授予或证据不存在时必须是 restricted/unknown，不能泄漏私有来源是否存在。`compilation.segments`、module diagnostics、compiled binding 是可利用的证据线索，不代表 Loom Core 式通用 Pass Trace、回放引擎或完整执行证明已经实现。

比较 authored/effective/wire 时分别记录 base/candidate 的 exact Program/Module 或 Draft 身份；两侧可以采用不同修订，这正是要比较的修改。将 Context Source/Actor/Branch/Grant、Route/Model/Provider/Compiler 等环境固定后，才把有效差异归因于作者修改；环境也变化时单列，不要求候选 Program 与基线引用相同。Token 标明计数方法。无游戏作者使用原 Host 限定的样例上下文，不把自填内容升级为真实世界事实；付费试读由用户主动调用原 Compute/Provider，编辑／预览不自动发送或强制 Judge。图像侧沿原 ImagePromptIR/Visual Job/Asset。

## 5. K：缓存布局与真实利用

| 候选 | 设计 | 取舍 |
| --- | --- | --- |
| **K1 现有纯 Prefix 指纹** || 成本低；不保证达到 Provider 真正可缓存前缀 |
| **K2 版本/信任域分区的 Stable→Dynamic 布局（已选）** | 作者/Program exact refs、稳定 Tool/Output schema 和固定指令尽量前置；Source/Actor/Scene/Branch/Turn/context 请求动态部分后置；重用需 Owner/Audience/Route/Model/Capability/TTL/grant/Source validity 真实匹配；用 Provider 实际 usage 测命中率与写入成本 | 与长会话性能、隐私隔离、Provider 能力差异一致；可能需对当前 Render 的中间 system 和 Prompt ordering 做受信调整 |
| **K3 跨 Actor/角色/模型语义相似直接重用** | 不论受众只要文本相近就认为可用 | 会串 NPC 私密 Context、错误复用不同来源/模型；不建议 |

**现有 fingerprint 是诊断，不是缓存许可**；Stage/Module 更改必须导致有效内容/版本失效。OpenAI/Anthropic/Gemini 对前缀、breakpoints、token 长度、TTL、价格与参数的支持不同；cache-control 不适用时不应伪造收益或为撑足阈值塞重复 Prompt。作用域必须避免多用户/多角色的信息关联与侧信道。

## 6. T：Context 和实际请求的预算闭环

| 候选 | 设计 | 取舍 |
| --- | --- | --- |
| **T1 只统计 Prompt 文本长度** | 近似 token 估算，不计 Tool、History/结构化输出、reasoning/output reserve | 易实现但对 Provider/长 RP 不可靠 |
| **T2 原 Context 预分配 + 每候选 Provider wire 再计数（已选）** | 先由原 Context Compiler/RunControl 分配合法 evidence/minima/caps/safety margin，然后经真实 ProviderPort 的 `countTokens` 对 final wire（含工具/JSON schema/前缀/输出预留）核算；另记录缓存真实 usage，不把 cache hit 预估当准入余额| 复用现有两条路径并补足 D4 binding/currentness/evidence 一致性，绝不新建预算账本 |
| **T3 预测模型弹性超配 token** | 先猜平均缓存命中/压缩效果再允许超出 Provider context ||

T2 需分别报告 context candidate/selected/prompt-prefix/tools/output reserve/provider final input/actual usage；Token 估算是**计数方法的证据等级**，不是“精确”保证。对 Anthropic/Gemini 等采用 byte upper bound 的现行 adapter，应如实说明是保守上界，允许按真实 Provider 可用 token-counter 升级；不能把本地 `cl100k_base` 强用于所有模型。Model 容量之外还有 V3 父子 Run 费用与调用次数，按原 Native Compute/TaskScheduler admission，不因缓存预测或文学质量调优透支账本。

## 7. 第五轮组合与来源

来源仅供 D5 架构取舍，**不是 Atria 当前实测证明**：
- [OpenAI Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)：前缀/breakpoint 与 Provider 上报使用量；
- [Anthropic Prompt caching & tools](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching)：tools→system→messages 的缓存层级、工具变化导致的前缀失效。
- [Gemini Context caching](https://ai.google.dev/gemini-api/docs/caching)：implicit/explicit 模型及 API 差异、usage metadata，不应宣称所有型号都支持相同模式。
- [OpenAI Reasoning](https://developers.openai.com/api/docs/guides/reasoning)：opaque reasoning continuation 保留协议身份，不等于可任意跨 Actor/Branch 使用的公共上下文。

## 8. 已冻结但未实施的接口缺口

- **B2 Host Program 接线**：V3 `agentPinId/dependencyPins` 只是资源 pin；原 `RuntimeRoute.promptProgramRef` 仍决定 Resolver 返回的 Program，未证实 Node 可在正式发送端独立覆盖。任何未来内部扩展必须保留 Host/Source/Role/Program closure 的精确授权，不开放 Browser 任意覆盖。
- **Fallback**：`GenerationService` 在候选 Route `promptProgramRef` 不同时返回 `generation_semantic_authority_changed`；B2 需真正保持受信 Node Program 与工具/输出合同、逐候选编译和预算。不能通过关闭报错伪称支持多模型。
- **Provider/Token/Cache**：OpenAI-compatible 的指定 tokenizer 与部分 Adapter 采用的保守 byte upper bound 不等价。实际 role、prefill/tools/schema、final wire 计数、cache TTL/cached tokens/cost 与动态 source 失效全部需要运行证据。
- G1 单 Narrator 不能无故多一次模型调用。
- **当前范围**：本轮不批准产品实现分支，不修改 `main`，不保留 ST 旧数据/API/Workspace/mode 兼容。Windows/CachyOS Linux/Termux、Browser、Node、Provider 调用/CI 均未运行，不能标 PASS。

第六轮 [Context/Memory/Cognition](context-memory-consumption.md) 只讨论合法来源的 Prompt 消费和长会话保真，不重建 HCM-01–08、V3 C2 或 Context Compiler。
