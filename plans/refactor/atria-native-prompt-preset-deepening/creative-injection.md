# D2 方案：高自由度原生作者指令编译与成人虚构 RP

**D2 已冻结：J2 + F2 + R3（2026-10-15）**。本模块是创作指令、合法成熟虚构 RP、Provider 真实能力及误拒诊断的唯一详细语义合同；物理 Schema、Compiler passes、具体 UI/API 留后续阶段，当前未开发。目标不是拆掉 Provider 安全边界，也不是压低用户文字 RP 自由度；两者应明确分离。

## 1. 原产品为什么不够强

传统 ST PromptManager/Author's Note、in-chat depth、post-history、role 主要控制某段文本被放在哪里。更多“破限”词往往只是给出更长的角色扮演说辞；模型升级后失效，可能占据长会话 Token、造成角色跑偏、抢占 World/Memory 信息、被理解为攻击。在 Atria 的 Agent/Native Context 下更严重：如果外部 WorldBook 一句话也能像作者指令一样注入，信息安全和角色真实感都会被破坏。

**目标替换**：从 `Offset/Depth-Based Text Injection` 升级为 **Authorial Instruction Composition + Provider-aware Lowering + Evidence-based Creative QA**。让创作者有力地表达故事要求，而不是依赖伪造的协议角色或无限重复。

## 2. 已认可的语义分层（优先复用原 Native resource）

- `AuthorIntent`（建议语义，不预设另建持久表）：明确的作品类别、作者约束/自由输入、场景目标、期望的表达强度。原生 Prompt Program/Module exact revision 管理。
- `NarratorExpression`：人称、时间、句式、节奏、镜头距离、感官描写、旁白/台词比例、成熟主题的文学氛围；与 `CharacterExpression` 的角色口癖、偏好和说话风格分离。
- `AgentBehavior`：按 V3 Node 引用 task/evidence/constraints；Writer 和 Judge 的需求不能混入一个大 Prompt。Prompt 不决定工具权限。
- `TrustLanes`：可信作者正文、Host 事实/决策规则、低信任证据/引文、用户本轮命令、模型响应建议，编译器必须逐段知道来源与角色；**不允许外部 data lane 提权**。
- `ModelLowering`：沿用 Provider Port，支持被当前 Model 明确宣告的 role、prefill、提示词格式、采样与安全配置。实际不支持即提示/显式失败，而不是偷偷篡改 role 或继续旧 sender。
- `CreativeEval`：按有依据的 source/case/Model/route/ProgramRevision 评价文笔、角色差异、情节推进、反全知、玩家自主权、成人主题无端说教/误拒、token 与成本。审阅与发布仍归原 Candidate/Evolution。

这些名称是已同意的**逻辑职责**，不是已批准的独立物理资源；D3–D5 仍要审查可复用字段与最少必要 Schema 扩展。不构成新 DB、Plugin、独立 Compiler、第二 Context/Eval Writer 或新 Agent 执行权威。

## 3. “破限”相关最值得提供的功能（面向正常作者）

1. **完整可编辑的 Author Instructions**：作者不必被迫选“温和/标准”三档，可以完整书写并版本化自己的故事和表达准则；可声明适用 RP/Agent/场景范围。
2. **结构化优先级和显式归属**：区分正式 Host/Domain 约束、作者创作规则、Player 即时选择、Actor 认知、World/Memory 证据、工具输出；不同来源有冲突解释，不能用旧 ST 后历史 system 位置冒充授权。
3. **积极示例与反例**：小规模、精心挑选的台词/旁白样例和反面风格示例，配置预算、语言、目标场景与精确版本；避免万字“越狱”对话和无限上下文填充。
4. **针对合法成熟题材的表达控制**：在使用者自愿选择和适用法律/Provider 支持范围内设置故事强度、亲密关系表达、人物欲望、现实边界、非说教风格等；“成人题材”本身不作为 Atria 自己的泛拒信号。不得把“提高表达强度”当作任何 Provider 必然愿意生成的证明。
5. **请求预览与来源解剖**：同一 Native PromptIR 显示各块的来源、有效 role、stage/target、是否被包括、最终 Provider wire request 摘要、Token、哪些指令被遮蔽/冲突。敏感源和 Secret 需脱敏。
6. **拒答/失败的独立归因**：Provider hard refuse / content blocked；本地 validation；Host Authority 拒绝；Model 有条件退避或未按文学任务作答；质量不足。不同原因用不同可行整改，不向用户谎称突破安全规则。
7. **候选变更与无害误拒评价**：目标是最大化合法作品满足度与人物连续性，非攻击成功率。用 OR-Bench 思路训练“误拒诊断”，GEPA 式文字反馈产生少量作者可审批的 exact 候选。
8. **更合适的模型路由**：支持经过真实 capabilities 测试的 Provider 和合法本地/开权重模型选项；能力差异写明，不承诺远端隐含安全可关闭，也不通过未经授权外部渠道重发内容。

## 4. 历史备选与已选路线

| 方向 | 设计 | 评估 |
| --- | --- | --- |
| **J1 原生 Slot 加强** | 扩展当前 target、stage、模块顺序、标签和预览，保留大部分纯文本手调 | 快速、简单；但容易只做到新的“高级 PromptManager” |
| **J2 编译型 Authorial Control（已选）** | 已授权作者指令、Expression / AgentBehavior / Evidence 数据分层；确定性 compiler + model lowering + 拒答诊断 + 质量候选发布 | 与 B / V3 最一致；工程范围可控；需要有限 schema/前端改造与信任边界整改 |
| **J3 全新创作 DSL/元编译器** | 再建独立文本规则语言、条件执行、自动 Prompt 搜索/写入 | 极致自由但二次编译/二次编排/跨域提权风险高，不建议现阶段 |

## 5. 重要边界的设计答复

- **作者自由不等于外部文本拥有指令权**。WorldBook 设定、Memory 历史、网页截取、他人私聊、Tool 返回必须仍是数据；本人通过正式 Review/Publish 转换成创作指令后，才进入相应受控指令层。
- **所谓“更强注入”不能按 role 字符串的字面名称推定权限**。例如某 Provider 只接受单独的 system instruction，必须按它真实的 wire schema 和限制处理。
- **有据可查的内容筛选设置可以暴露给用户，但不能伪造供应商 API 不提供的设置**。可供选择的合法本地/开权重模型同样要真实评价，并受产品正常权限与运行约束。
- **质量系统严禁把“模型是否被成功攻破”的攻击指标混入小说优化目标**；只评价合法创作误拒、文本质量、角色/世界一致性和真实成本。
- **不以 Atria 自身的道德说教覆盖已获准的成年人虚构文艺创作**，但也不能承诺任何题材必然被所有外部模型接受。

## 6. J2：正式作者指令的编译合同（已选）

- 正式作者指令通过已有 Native Library/Project/Package Authoring、Review/Publish、精确资源 revision 管理。每块在编译时需要记录来源、适用 scope/role、stage、目标 Audience 与版本；不依据文本自称的 `system`、`developer` 或 WorldBook 内“新规则”提升权限。
- Writer、Character Voice、Agent Task 与低信任 Evidence 必须被 Compiler/Provider lowering 明确区分；Native PromptIR 的 determinism/provenance、ContextPlan、Preview 与执行结果继续由原路径生产。新 UI/Schema 不得成为事实或工具权限的第二入口。
- 保留由作者完整编辑的 Creative Instructions、正/反例和高表现力文字写作策略；高强度表达控制并不等于“越狱后缀”或无限堆提示词。经过原有 Source Grant/Domain Policy 的内容可被选入 Context，但其指令性不可因来自 World/Memory/Tool 而自动升格。

## 7. F2：结构化+自由文本的单一资源

- 结构化面板设置作品、文风、旁白、角色语言与成人题材的艺术表达方式；专家可完整编辑原始作者指令，既可覆盖模板，也可使用已有 Native Prompt Module/Program 组合与精准版本差异。
- 面板状态与原文共同指向**同一份合法 versioned Native definition**；不可无损编辑/回写时应提示不可自动折返、保留原文而非覆盖；对每次修改显示 authored 原文、有效编译结果及已发布 revision 的差异。
- 公开显示最终 Stage/Target、来源标签、Provider 实际采用的 role/格式、Token/缓存与冲突诊断；不得在作者不可见时另加泛化道德化 Prompt 或暗中改变文章风格。

## 8. R3：分类诊断、候选优化与用户控制路由

- **诊断区分**：Host/Context/Schema/Authority 失败；Provider 显式 content block/refusal；模型疑似对合法文学任务过度回避；模型完成但文学表现差；Provider 参数/role 未支持；未知原因。每种必须保留来源和证据等级，别将模型一句抱歉都认作 Provider 强拒，也别把质量差统称安全误拒。
- **合法优化**：使用原 Experience/Eval、受审 QualityProfile 和 PromptCandidateStore，比较作者表达、人物一致性、文学节奏、合法误拒与真实成本；精确版本候选必须经原 Review/Publish，不能以“是否击穿第三方保护”为指标。
- **用户控制**：可以解释并展示真实支持模型、公开可调的相应参数与合法 Prompt 优化方式；内容拒绝不得静默自动重发到另一个 Provider。原 Native Route 为暂时性传输错误的既有 fallback 不因这条规则改变。
- **边界**：Atria 自身不要将成年虚构情感题材一律视为应拒绝或道德化处理；外部 Provider 是否提供该类生成及限制由其真实能力与适用要求决定，不伪造开启安全控制的私有开关。

## 9. 将来实际 E0/实施验收门槛（当前 NOT_RUN）

1. 检查 `prompt-renderers.js` 是否将低信任 ContextSlot 包装成 `system`，要求编译层与数据源测试能区分合法作者指令和 World/Memory/Tool/检索证据。
2. F2 视图无损往返、版本化比对和多层冲突诊断；作者原始文本不得被面板重排/删改而无提示。
3. 提示词 Preview 与真实 Native 发送使用同一 Compiler/Route/Provider 能力快照，unsupported/unknown 显示真实原因。
4. RP 真实案例衡量文笔、声音差异、剧本连贯、玩家自主权、反全知、合法过度拒答；不能仅以少拒答表示进步。
5. 使用已冻结 V3 单 Native Host/Plan-Prompt exact binding、原 Context/Model/Eval/Promotion Port，不插入旧 ST Adapter；预算、恢复、审批及三端真实验收留正式实施。

D3 开放议题和实例由 [narrative-behavior.md](narrative-behavior.md) 讨论，未获授权前不冻结任何 D3 方案。
