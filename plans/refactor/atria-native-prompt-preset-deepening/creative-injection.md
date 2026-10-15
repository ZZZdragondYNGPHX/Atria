# D2 方案：高自由度原生作者指令编译与成人虚构 RP

本模块是**第二轮讨论草案**，只有 D1 目标已冻结。目标不是拆掉 Provider 安全边界，也不是压低用户文字 RP 自由度；两者应明确分离。

## 1. 原产品为什么不够强

传统 ST PromptManager/Author's Note、in-chat depth、post-history、role 主要控制某段文本被放在哪里。更多“破限”词往往只是给出更长的角色扮演说辞；模型升级后失效，可能占据长会话 Token、造成角色跑偏、抢占 World/Memory 信息、被理解为攻击。在 Atria 的 Agent/Native Context 下更严重：如果外部 WorldBook 一句话也能像作者指令一样注入，信息安全和角色真实感都会被破坏。

**目标替换**：从 `Offset/Depth-Based Text Injection` 升级为 **Authorial Instruction Composition + Provider-aware Lowering + Evidence-based Creative QA**。让创作者有力地表达故事要求，而不是依赖伪造的协议角色或无限重复。

## 2. 建议模块语义（尽量复用原 Native resource）

- `AuthorIntent`（建议语义，不预设另建持久表）：明确的作品类别、作者约束/自由输入、场景目标、期望的表达强度。原生 Prompt Program/Module exact revision 管理。
- `NarratorExpression`：人称、时间、句式、节奏、镜头距离、感官描写、旁白/台词比例、成熟主题的文学氛围；与 `CharacterExpression` 的角色口癖、偏好和说话风格分离。
- `AgentBehavior`：按 V3 Node 引用 task/evidence/constraints；Writer 和 Judge 的需求不能混入一个大 Prompt。Prompt 不决定工具权限。
- `TrustLanes`：可信作者正文、Host 事实/决策规则、低信任证据/引文、用户本轮命令、模型响应建议，编译器必须逐段知道来源与角色；**不允许外部 data lane 提权**。
- `ModelLowering`：沿用 Provider Port，支持被当前 Model 明确宣告的 role、prefill、提示词格式、采样与安全配置。实际不支持即提示/显式失败，而不是偷偷篡改 role 或继续旧 sender。
- `CreativeEval`：按有依据的 source/case/Model/route/ProgramRevision 评价文笔、角色差异、情节推进、反全知、玩家自主权、成人主题无端说教/误拒、token 与成本。审阅与发布仍归原 Candidate/Evolution。

这些名称是**设计候选**，D2–D5 判断哪些是现有字段的组合，哪些必须扩展 contracts；不构成新 DB、Plugin 或第二 Writer 授权。

## 3. “破限”相关最值得提供的功能（面向正常作者）

1. **完整可编辑的 Author Instructions**：作者不必被迫选“温和/标准”三档，可以完整书写并版本化自己的故事和表达准则；可声明适用 RP/Agent/场景范围。
2. **结构化优先级和显式归属**：区分正式 Host/Domain 约束、作者创作规则、Player 即时选择、Actor 认知、World/Memory 证据、工具输出；不同来源有冲突解释，不能用旧 ST 后历史 system 位置冒充授权。
3. **积极示例与反例**：小规模、精心挑选的台词/旁白样例和反面风格示例，配置预算、语言、目标场景与精确版本；避免万字“越狱”对话和无限上下文填充。
4. **针对合法成熟题材的表达控制**：在使用者自愿选择和适用法律/Provider 支持范围内设置故事强度、亲密关系表达、人物欲望、现实边界、非说教风格等；“成人题材”本身不作为 Atria 自己的泛拒信号。不得把“提高表达强度”当作任何 Provider 必然愿意生成的证明。
5. **请求预览与来源解剖**：同一 Native PromptIR 显示各块的来源、有效 role、stage/target、是否被包括、最终 Provider wire request 摘要、Token、哪些指令被遮蔽/冲突。敏感源和 Secret 需脱敏。
6. **拒答/失败的独立归因**：Provider hard refuse / content blocked；本地 validation；Host Authority 拒绝；Model 有条件退避或未按文学任务作答；质量不足。不同原因用不同可行整改，不向用户谎称突破安全规则。
7. **候选变更与无害误拒评价**：目标是最大化合法作品满足度与人物连续性，非攻击成功率。用 OR-Bench 思路训练“误拒诊断”，GEPA 式文字反馈产生少量作者可审批的 exact 候选。
8. **更合适的模型路由**：支持经过真实 capabilities 测试的 Provider 和合法本地/开权重模型选项；能力差异写明，不承诺远端隐含安全可关闭，也不通过未经授权外部渠道重发内容。

## 4. 第二轮三种路线（待选择）

| 方向 | 设计 | 评估 |
| --- | --- | --- |
| **J1 原生 Slot 加强** | 扩展当前 target、stage、模块顺序、标签和预览，保留大部分纯文本手调 | 快速、简单；但容易只做到新的“高级 PromptManager” |
| **J2 编译型 Authorial Control（推荐）** | 已授权作者指令、Expression / AgentBehavior / Evidence 数据分层；确定性 compiler + model lowering + 拒答诊断 + 质量候选发布 | 与 B / V3 最一致；工程范围可控；需要有限 schema/前端改造与信任边界整改 |
| **J3 全新创作 DSL/元编译器** | 再建独立文本规则语言、条件执行、自动 Prompt 搜索/写入 | 极致自由但二次编译/二次编排/跨域提权风险高，不建议现阶段 |

## 5. 重要边界的设计答复

- **作者自由不等于外部文本拥有指令权**。WorldBook 设定、Memory 历史、网页截取、他人私聊、Tool 返回必须仍是数据；本人通过正式 Review/Publish 转换成创作指令后，才进入相应受控指令层。
- **所谓“更强注入”不能按 role 字符串的字面名称推定权限**。例如某 Provider 只接受单独的 system instruction，必须按它真实的 wire schema 和限制处理。
- **有据可查的内容筛选设置可以暴露给用户，但不能伪造供应商 API 不提供的设置**。可供选择的合法本地/开权重模型同样要真实评价，并受产品正常权限与运行约束。
- **质量系统严禁把“模型是否被成功攻破”的攻击指标混入小说优化目标**；只评价合法创作误拒、文本质量、角色/世界一致性和真实成本。
- **不以 Atria 自身的道德说教覆盖已获准的成年人虚构文艺创作**，但也不能承诺任何题材必然被所有外部模型接受。

## 6. D2 需要用户选择的关键点

- J1 / J2 / J3 方向。
- 对作者编辑偏好：**F1 完全自由文本优先** / **F2 结构化表达面板 + 随时可编辑完整原文** / **F3 自动优化优先**。
- 当 Model/Provider 对作者创作要求实际拒绝时：**R1 清楚归因并由用户选择受支持的 Route** / **R2 保持当前 Route、显示可尝试的合法 Prompt/Expression 优化候选** / **R3 两者兼备，但不悄悄换线**。

选择以后应先更新同一 Bundle 与 Record 提交，随后讨论 D3 人物语言、Narrator、Agent 行为的领域语义。
