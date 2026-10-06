# Behavior / Context / Generation：语义到请求

> D2 纳入正式架构方向；本模块是职责与验收的权威来源。资源名、Schema、迁移 API 在 G01 / G02 前细化，不表示已有实现。
> 输入研究：[Prompt / Context 报告](../model-prompt-context-frontier-research.md)。当前代码事实见 [baseline](baseline.md)，计算与路由分别见 [compute-policy](compute-policy.md)、[model-routing](model-routing.md)。

## 1. 明确分层及修改权

| 层 | 回答的问题 | 权威与消费者 |
| --- | --- | --- |
| World / Authority | 什么是真的、谁可修改 | 现有 SessionCore / Studio；Prompt 只消费获准投影 |
| Identity / Cognition | 谁在行动、此刻相信和意图什么 | Actor 精确资源与 branch-local cognition；不因换文风改人格 |
| Memory / Evidence | 有什么来源可支持当前判断 | 现有 Memory / Information 与 source adapters；不新建事实图 |
| Context Policy / Plan | 这一请求实际看到什么 | 现有 context provider / compiler；负责 selection、exposure、预算和 freshness |
| Task / Intent | 谁完成什么、成功与输出归谁 | 当前 Runtime / Project / Goal 契约；带 required evidence 与 capabilities |
| Behavior Program | 如何完成认知或创作任务 | 现有 PromptModule / PromptProgram；软指导、typed inputs / outputs、可版本化方法 |
| Creative / Expression | 故事与角色如何表达 | 用户创作意图、Actor 表达资源；由正文 consumer 消费 |
| Generation Profile | 允许多少输出和推理、如何采样 | 现有精确 Generation 资源，受预算与 deployment 能力约束 |
| Tool / Output Contract | 输出如何校验、哪些工具可用 | Runtime / authority 的真实 schema；模型文本不能修改 |
| Model Overlay / Lowering | 如何映射到当前调用边界 | Provider adapter 与精确优化资产；不改变上层权限或事实 |

这些是语义职责，不是十个服务或十次模型调用。沿现有 Prompt IR / RequestContextPlan / provider ports 扩展；只有真实 consumer 需要时才注册资源。
Behavior 可以声明信息需求，实际选择哪些 Memory / Knowledge 由 Context authority 决定。Raw instruction、few-shot 和自定义 overlay 保留高级编辑入口，但不能扩权或改变 schema 验收底线。

## 2. RP 的五种控制分开

- Identity：稳定背景、价值观、人格倾向与作者设定。
- Cognition：当前 belief、intention、emotion、关系解释与 ToM；来源是获准事件。
- Character Expression：角色词汇、语气、停顿和动作表达。
- Narration：视角、镜头距离、描写密度、节奏、对白比例与旁白声音。
- Scene / Genre：当前场景语境，受用户选择与 Package 规则约束。

Creative Profile 先表达用户可理解的意图，例如慢节奏、第三人称、偏对白；最终名称与控件在 G02 / G06 定稿。玩家行动归属属于硬底线，不能当可优化的文风参数。
至少有“换旁白风格而 Actor identity / cognition 不变”和“不同角色口癖不污染旁白 / 他人”的独立案例。
Project 复用 Behavior、Context、Generation 层；不强加娱乐文风或 NPC 情绪配置。

## 3. Context 选择、展开与压缩

Context lanes 按来源与用途组织：固定方法 / 合约、身份核心、当前 task / input、获准 world view、动态 cognition、Memory / Evidence、必要历史、tool results。
每个 item 保留 exact source ref、actor / task exposure、选择原因、内容 hash、token 计数来源和失效条件。必需证据不足时阻断依赖它的行动或转审阅，不为了容纳上下文静默丢掉必要 guard。

默认从 exact refs、已有 graph / index、recency 与获准 vector retrieval 选择；LLM query rewrite / rerank / synthesis 属于有触发证据的额外计算。
工具先按 role / capability / task 过滤，支持有限发现与按需展开。工具索引可见不等于工具获准；延后加载仍须在调用前检查同一 allowlist。

压缩不是覆盖源历史：派生产物带 policy / producer revision、source refs / hash、覆盖与遗漏说明；旧来源修订后失效。不同 lane 可用不同策略。
通过同一输入的后续 continuation 评价压缩是否保留承诺、秘密边界与工具参数依据；摘要更短或检索命中更高不能单独证明有用。

稳定 prefix / 动态 suffix 是可选 adapter 优化。缓存身份绑定 owner、获准 scope、target、工具 / 合约、overlay、compiler 与内容指纹；不跨 scope 复用私有内容。
缓存失效不能绕过 source freshness；为命中缓存额外塞入无关内容必须通过质量—成本对照。Provider-side context handle 仅在真实能力和生命周期可验证时接入，不能成为隐藏 Memory authority。

## 4. 确定性编译与优化分离

`固定 Task / semantic profiles / Context Plan / contracts → Semantic Request → 精确 model overlay → provider lowering → request snapshot`

固定输入与 compiler / adapter 版本应得到同一编译产物；provider role、XML、ChatML、prefill 或 parts 只在 lowering 阶段出现。
确定性检查包括类型、scope、互斥配置、已声明冲突、token admission、工具 / 输出支持与 provenance；不能声称纯代码能理解全部自然语言矛盾。
LLM rewrite、few-shot selection、GEPA / DSPy 风格搜索产生新的候选 revision，进入隔离 eval / promotion，不能藏在每次编译里。

Model overlay 绑定可观察的 target / model identity evidence、adapter、任务类与验证覆盖。只替换措辞、例子、顺序和获准控制；不得修改用户意图、Actor identity、权限或世界事实。
模型 alias、gateway 映射或 adapter 更新时重新验有效性；无法确认上游 snapshot 就记录证据级别和短期验证范围，不能声称跨模型通用。
Exact request 提供重建编译输入与审计能力；不承诺随机模型响应、provider-managed alias 或 opaque gateway 可逐字重放。

## 5. 演进与兼容

M1 仍使用当前 Skill、Prompt、Preset authority；S08 的允许文本区块、S09 的已有配置先交付，不等待 G01–G06 全面改造。
G01 / G02 显式分类旧 Preset 混合内容，建立版本化映射与诊断；无法确定是 identity、规则还是 style 的部分保留为 scoped raw module 并要求选择，不猜测迁移。
旧精确资源、PackageVersion 与 active binding 保持可读；新模型配置采用新 schema / version，未知版本拒绝。切换前验证 compiled request，切换失败恢复旧 exact binding。
不为保留 ST UI / identifier / injection position 固化新设计；已有数据兼容由迁移与显式选择保障，不通过静默 legacy fallback。

S27 的 prose ExpressionPlan 消费上述角色表达 / Narration 语义；语音和 Avatar 再消费相同 intent 与允许公开的投影。
LoRA、vector prefix、learned control 留在 S34 / 研究池；只有可用 backend、序列化和 eval 成立时引入，近期不注册无消费者的万能控制对象。

## 6. 可交付验收

G02 必须由 RP 正文与 Project 真实请求消费同一语义边界：确定性编译、权限过滤、预算不足、source stale、工具按需展开及 overlay 不匹配都有实际结果。
G06 比较当前配置与分层配置的质量、token、cache、延迟及用户偏好；模型 / compiler / Context / Creative 变化分别归因。
压缩与 progressive disclosure 有后续行为案例；旧资源读取、save / export / restore、关闭新路径与撤回均可验证。
