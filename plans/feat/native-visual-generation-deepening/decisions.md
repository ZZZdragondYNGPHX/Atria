# Atria 原生视觉生成系统深化 — 冻结决策

> 本文件**只包含已经得到用户批准的跨模块决定**。技术假设与备选提议在 [architecture.md](architecture.md)；代码审计在 [baseline-and-reference.md](baseline-and-reference.md)。未在本文件冻结的内容不得由 Codex 视为用户已批准。

## D-001（2026-10-14，Round 1）— 分层混合架构

- **Decision**：选择方案 **C**。系统底层共享统一的意图、提示词/后端适配、任务管理、图片版本与资产存储能力，上层支持三种用户可选择的使用方式：
  - 手动：由用户指定画面/选段和生成。
  - 半自动：系统提出场景与候选，用户参与审阅/修改/决定执行。
  - 全自动：在用户配置和允许的边界内自动决定何时请求图像。
- **Reason**：同时保留精细创作能力与未来的叙事自动插画，不使三套模式分别形成重复代码或互不兼容的存档。
- **Affected modules**：`architecture.md`；未来 Provider、Director、Prompt、Reference、UI、Scheduler、AssetStore 模块。
- **Scope limit**：触发时点遵循 D-002，协议分层遵循 D-003；模式默认值、自动执行许可/费用、精确数据结构、独立 LLM Route 配置、目标后端仍待后轮定案。不能从“全自动模式存在”推导“任意自动扣费”。

## D-002（2026-10-14，Round 2）— 已提交剧情后决策

- **Decision**：选择 **方案 A**，采用 Post-Commit Visual Director。只有剧情正文已经成功提交、能确认 `sessionId / branchId / revisionId` 及来源文本/Variant 的正式快照之后，才允许 Director 分析该剧情、发布正式的视觉候选意图，并按手动、半自动、全自动模式的后续规则执行。
- **执行时序**：**提交剧情 → 冻结来源身份/可见上下文 → Visual Director 决定画面候选 → 用户选择或自动授权（具体策略待定）→ 提交实际图片 Provider 请求 → 图片/版本绑定原始分支**。手动选段亦只能基于已经提交的正式剧情，不能把尚在流式展示的临时正文作为已确认的图片来源。
- **禁止当前实现**：剧情流式生成过程中，不启动基于该未提交正文的 Visual Director 预判，也不对其调用实际图像 Provider；失败、中断、撤销或未提交的文本不能触发正式 VisualIntent。取消或切换当前会话后，已提交并已授权的任务按其固定历史分支处理，不能悄悄改绑当前 HEAD。
- **Future extension only**：后续可以单独讨论 B（流式轻量预判，提交后再严格复核），但本轮没有批准其实现、费用支出、持久化或上线；不得把“接口预留”解释成先实现 speculative 任务。C（未提交即调用真实生图 Provider）不纳入当前设计。
- **Reason**：防止流式正文反转、梦境揭示、取消/切换分支造成的错配与无效费用；优先维护 Native Revision、SavePoint 和图片资产的一致性。
- **Affected modules**：`architecture.md`、未来 Director/Intent、Context、Job/Cost、UI、Save/Restore 流程。
- **Scope limit**：本轮**只**冻结视觉决策的时序与可信来源；导演触发频率、场景数量、LLM 执行配置、自动扣费许可、预算审批与 UI 默认值仍待后续决定。

## D-003（2026-10-14，Round 3）— 语义统一、能力分离的多后端生图架构

- **Decision**：选择 **方案 C：结构化语义 Image Prompt IR + 独立 Provider Adapter + Capability Negotiation**。全局统一视觉语义、叙事来源、任务/结果/版本/证据；每个图片 Provider 自己实现请求编译、参数与输出解码，不强制模型遵循一张包含 sampler/steps/CFG 的通用参数表。
- **Image Prompt IR**：表达来源 Revision、视觉场景、角色身份、动作、构图、画风、参考素材和约束等独立于 Provider 的概念；保留人工直接编写 Raw Prompt 的操作方式，不允许规划 LLM 静默覆盖用户输入。精确字段、序列化结构、不同画作种类范围仍待专门设计。
- **Adapter boundary**：Provider/Workflow 专有能力、参数、协议、进度/取消、远端任务标识及结果解析由后端 Adapter 管理；既有 `role.illustration_prompt` 文本模型路线与实际图像 Provider 配置是不同职责。
- **Capability Negotiation**：以实际“连接 + 模型版本或工作流”为判定单位，区分已支持、不支持、未知。必需特性不被静默丢弃；执行前显式拒绝或按后续经过批准的降级策略处理。
- **Image Evidence**：每一生成版本保持非秘密的冻结 IR/编译结果指纹、Provider 模型/工作流身份、有效能力/实际参数与来源分支快照，保留历史可追溯性与 AssetStore、SavePoint/分支安全。不能继续在通用图片校验层硬调用 NovelAI 专用渲染器。
- **Reason**：可实现 NovelAI/ComfyUI/SD/云图像 API 的真实能力差异，同时避免角色/世界视觉连续性重复实现、图片历史锁死于某家 Provider。
- **Affected modules**：[provider-protocol.md](provider-protocol.md)（本决定的详细分层约束）；未来 image compiler、provider registry、capability manifest、image-job、asset/evidence、设置 UI。
- **Scope limit**：架构分层与能力/历史不变量已冻结；Provider 范围、顺序与三层配置遵循 D-004。精确 IR/API 字段、默认模型、自动调用许可、图生图/Vibe/视频等细化范围仍待议。

## D-004（2026-10-14，Round 4）— 多后端分期完整覆盖与三层配置

- **Decision**：用户选择 **方案 B：跨家族分阶段完整覆盖**。逐家族实现同一 Image Prompt IR / Capability Negotiation / ImageJob / AssetStore 体系。
- **P0（首批）**：NovelAI 官方及明确协议兼容接口（V3、V4、V4.5、V5；V5 需要独立能力与协议校验）；ComfyUI 自部署 Workflow API；OpenAI 官方 Images API。
- **P1（后续纳入本企划范围）**：Gemini 原生图像生成（含当时可用 Nano Banana 类模型）、SD WebUI / A1111 / Forge 兼容 API、RunningHub Workflow API。
- **P2（可扩展机制，不承诺任意通用兼容）**：后续经过明确协议验证的其他图片 Provider，可复用 Adapter 注册体系增量加入。
- **三层配置**：`Image Connection`（服务连接、Endpoint、Secret）；`Image Target Profile`（具体模型/版本或 Workflow、Provider-native 参数与实际能力清单）；`Image Rendering Profile`（画风/风格约束与默认 Target 策略）。一条 Connection 可关联多个模型/Workflow Target，渲染语义不能与 Provider-native 参数混为一层。
- **配置覆盖顺序**：**单次任务 > 单标注 > 作品 > 全局默认**，缺省逐级继承；用户可显式按作品、标注或任务选目标。提示词 LLM Runtime Route 与图片 Connection/Target 分离。
- **执行边界**：工作流按节点类型校验映射，不能在 JSON 中任意字符串替换；真实请求固定 Target/Connection/参数指纹与非秘密证据。未经后续批准不得静默丢弃必要能力，亦不得因为失败就自动切换收费 Provider。默认模型/预算/fallback 策略未在本轮批准。
- **Reason**：同时覆盖角色插画、工作流本地部署与云端自然语言生图，又不把所有后端强行归一成同一套 steps/sampler 或同一张账号设置表。P0/P1 是交付先后而非永久排除 P1。
- **Affected modules**：[provider-protocol.md](provider-protocol.md) §5；未来 Provider Registry、Target/Rendering 配置与 UI、资产/请求证据和任务调度。
- **Scope limit**：本轮冻结的是 **后端家族、开发优先级与三层配置及覆盖关系**，不等于已完成任何接入，也**不等于**获准一次性实现所有 Provider 特有的图生图/参考图/Vibe/视频/控制插件；这些需后续逐项定案。

## D-005（2026-10-14，Round 5）— 状态驱动的分层视觉权威

- **Decision**：用户选择 **方案 C：状态驱动的分层视觉权威**。明确区分三层：
  1. **Visual Identity**：角色是谁；正式 Package Actor 采用精确 `actorId` 绑定角色身份/基础外观/经批准的标准参考。自由 RP 和尚无正式 Actor 的临时角色必须有明确的作用域与稳定身份，不能靠同名字符串全局合并。
  2. **Visual State**：角色在该剧情时点的服装、发型、伤痕、装备及场景变化；由**已提交、相应 Revision/Branch 中的正式世界/剧情事实及许可投影**导出，不创建与 Session/World 竞争的第二套剧情真相数据库。
  3. **Visual References**：角色身份参考、服装参考、场景参考、画风/Vibe、构图参考各自具有用途、来源和权限；它们是呈现条件，不是剧情事实。
- **时点与分支隔离**：视觉请求必须固定源 `sessionId/branchId/revisionId`（必要时含具体 Variant/选文）；同一角色跨分支可受控复用基础身份/用户批准的标准参考，但**不得复用不匹配的动态服装、伤势、场景事实或直接将另一分支图片当当前事实**。
- **视觉事实边界**：生成的图像或参考图内的偶然元素（凭空出现的戒指、旧衣服或伤势）不自动写回 Actor/World/Memory/正式叙事。若需要更新世界状态，必须走 Atria 原有权威写入途径。
- **可见性与防剧透**：从正式信息中可读取，不意味着允许画进玩家可见图像。Visual Director/IR 编译须遵守源 Revision 的 Information Runtime / disclosure 规则，避免用 NPC 私密认知、未公开事件、另一分支未来状态泄露信息；不能把整个世界目录作为无约束视觉上下文。
- **参考条件一致性**：身份参考可以辅助保脸，不能因为参考图旧服装或旧伤痕而覆盖目标时点的事实；各 Provider 只能在其经能力验证的支持边界内编译，必要约束无法满足时不能静默丢弃。
- **Reason**：保证长期 RP 的人物身份持续、剧情中的外观变化正确，以及 SavePoint/Branch/玩家显示权限的一致性；不让视觉子系统形成“第二剧情内核”。
- **Affected modules**：[visual-continuity.md](visual-continuity.md)（本轮详细权威）；`architecture.md`、`provider-protocol.md`，以及未来角色/世界信息投影、IR、参考图资产、Renderer 和保存/恢复模块。
- **Scope limit**：本轮冻结的是**三层分工、身份与时点来源、分支/隐私与事实边界**；视觉状态如何自动抽取与更新、固定/动态状态冲突时的精确优先级、参考图/Vibe 的强度和自动选择算法、具体 Provider 功能与费用策略**均留到第六轮及以后**，不能把候选规则当成已批准实现。

## D-006（2026-10-14，Round 6）— 证据驱动的混合视觉更新与参考选择

- **Decision**：用户选择 **方案 C：证据驱动的混合更新与冲突仲裁**。从已提交的源 `sessionId/branchId/revisionId` 提取正式 World/Actor/Lifecycle 状态、授权事件和对应已提交叙事证据；未结构化的换装、伤痕、场景变化允许 LLM 生成可溯源的**派生视觉候选**，并以证据校验驱动视觉投影，**不得自动写回 World/Memory/Narrative**。
- **更新规则**：明确、证据充分且无冲突的候选可以自动应用于**派生的 Visual State**；不确定或关键冲突进入待审查/禁止自动发布。未提到不代表清空原状态；持续特征到有可信的新变更为止，表情/动作等片段性特征不跨场景滥用。同一 Revision 内不同选文的发生顺序需要区别，不能让结尾外观覆盖开头。
- **冲突仲裁**：先验证已提交来源/角色身份/分支与时点/玩家披露权/素材权限/Provider 必需能力这些硬门禁，再对正式状态、同一时点明确描写与玩家/作者固定外观做证据化解析。正式状态与叙事互相矛盾须检查时序、必要时走原有状态更新流程或交给用户审查；不能让 LLM 擅自裁定，也不能把渲染偏好或错误图片转为世界事实。
- **参考图选择**：先按身份、分支/时间、作品、权限、状态相符性、资产有效性过滤；再按 **角色身份、服装、环境、画风/Vibe、构图** 等分离用途进行可靠来源/时点/用户偏好/图像质量排序；最后在具体 Image Target 上做 Capability Negotiation。批准的通用标准身份图可受控复用；非匹配分支的动态剧情图默认不作为当前视觉事实。
- **退化与审计**：不可静默放弃必要参考或隐式换收费 Provider；能力组合冲突需要明确反馈。每项实际参考的用途与来源和有效配置纳入非秘密请求证据、AssetStore 版本引用与存档保护。
- **Reason**：在具备结构化世界状态的游戏与自由 RP 自然语言叙事之间兼顾连续性，避免视觉状态漂移、同一 Revision 内时序串错、分支污染与参考图携带旧衣物等偶然特征。
- **Affected modules**：[visual-continuity.md](visual-continuity.md) §5；[architecture.md](architecture.md)；[provider-protocol.md](provider-protocol.md) 的 capability/evidence 边界；未来 Visual State Resolver、Reference Selector 与 Session projection/AssetStore。
- **Scope limit**：冻结混合更新、硬门禁与冲突处理、按用途参考图过滤/选择的**原则**；没有批准精确分数/阈值/候选上限、具体 Vibe/Reference 参数或自动生成图片的费用/触发策略。后者属于第七轮。

## D-007（2026-10-14，Round 7）— 分级事件驱动的 Visual Director、隔离预算和可靠作业

- **Decision**：用户选择**方案 C：分级事件驱动 + 场景价值筛选 + 可靠作业**，不是按固定聊天楼层机械生图，也不是无条件每次 Commit 调一次完整 Director LLM。仅在**正式剧情 Commit** 后，对通过 D-005/D-006 可见性、角色/时点与分支硬门禁的候选进行低成本场景/视觉变化检测；必要时再由独立 Director LLM 深入评分和选镜头。
- **自动选图与跳过**：以有视觉表现力的场景变化、关键人物出场、重要行为或转折、视觉状态变化等形成候选，综合剧情重要性、画面完整度、独特性、与既有画面的重复度和连续性判断价值；允许跳过不值得绘制或与已有图重复的内容。**场景可横跨多回合、一回合可有多场景**；不能把一楼一图或最新的 World State 误作所有选段的状态。
- **三种模式共用底层**：手动指定的有效来源可绕过自动价值筛选，但仍经过安全/能力/授权/费用检查；半自动展示可审阅候选；全自动只对已配置并获得产品层授权、符合实际 Provider 能力与预算的候选发送请求。生成不得阻塞正式剧情提交，未提交正文不得触发（继续遵守 D-001/D-002）。
- **预算隔离**：维护**Director/提示词 LLM 的调用、Token、超时与费用预算**和**图片 Provider 的请求、图像数量、并发、估算费用/额度预算**两个独立账目，拒绝“判断不生图也必须付高额 LLM 费用”的无条件策略。付费云 Provider、可能收费的参考图/工作流步骤与本地 GPU 占用分别按可观测能力核算。**正式产品预算独立于 Governance §13.1 的开发测试 API 限额**。
- **授权与跨 Provider 安全**：手动、半自动和全自动各自遵守明确可撤回的用户模式/预算政策；无授权不得产生不可预期的付费请求；不能因为某张图失败就静默切换另一收费服务。预估费用与上游实际计费不等价，应明确标记未知金额或未取得回执。
- **持久 ImageJob / 防重复**：以冻结的场景/源 Revision、实际 Target、请求快照与明确的生成意图维持持久作业身份和状态，不只依赖内存 `NativeTaskScheduler`。去重正常重放，区分用户明确发起的“再生成新版本”。进程重启应重新认领符合授权的未提交任务；已到达远端的任务优先按远端 Task ID / 幂等键对账并恢复结果，避免重复计费。
- **不确定态与持久发布**：请求可能已送达但没有可靠的远端 ID/幂等查询时，标记**提交不确定**并停止盲目自动重发；失败重试必须按 Provider 能力、预算和已知请求状态执行。远端取消确认与本地取消分离，不声称必然退款。ImageVersion/AssetStore 发布应幂等且与原 Branch 关联，不因切换 HEAD 或重复回调覆盖已选图片；SavePoint/引用 GC 保持既有安全边界。
- **Reason**：使长会话中的重要场面获得适量插画，减轻无价值的 LLM/生图消费，并避免关闭客户端、服务崩溃、分支切换或网络不确定性造成重复扣费和数据错归。
- **Affected modules**：[visual-director.md](visual-director.md) 为具体流程/待议算法权威；[architecture.md](architecture.md) 为导演与叙事边界；Provider 能力/费用/响应证据与存档见 [provider-protocol.md](provider-protocol.md)、[visual-continuity.md](visual-continuity.md)。
- **Scope limit**：本决策仅冻结分级调度、预算隔离、持久作业等原则；**第八轮 D-008 随后冻结了场景/镜头、评分、可调默认额度和作业恢复的具体策略**。精确 API/数据库 Schema、Provider 费用协议及编辑功能矩阵另议。

## D-008（2026-10-14，Round 8）— 场景感知的自适应镜头、预算默认与持久恢复

- **Decision**：用户选择第八轮 **方案 C：场景感知的自适应导演**。以 D-007 为基础，正式冻结跨 Commit `Scene` 与准确 `Shot` 锚点、可解释多因素评分与动态软节奏、默认关闭的付费安全策略、Planner/Image 独立硬预算、可恢复的持久 ImageJob Ledger。详细工程设计以 [visual-director.md](visual-director.md) §7 为唯一权威，本节为跨模块摘要。
- **Scene/Shot**：Scene 由正式剧情中连续时间/空间/人物/事件语义划分，可跨多个提交；一个提交可出现多个 Scene，Scene 可含多个 Shot。Shot 精确绑定当时的 Branch/Revision/消息 Variant 与正文范围，历史图不随新 Commit 或场景重分割改写。回忆、梦境、幻想、时空跳跃与倒叙具有独立叙事 frame；不可把当前或另一分支状态回填过去。共享祖先只复用来源身份和授权均完全匹配的历史。
- **镜头价值**：先执行 D-005/D-006 的时点、身份、权限、素材和必需 Provider 能力硬门禁；再以 `30% 剧情重要性 + 25% 画面明确性 + 20% 新颖性 + 15% 连续性 + 10% 覆盖缺口` 为可配置的初始评分权重，减去 0～30 的视觉重复惩罚；默认 `>=75` 为优先候选、`55～74` 为中等候选、`<55` 自动跳过。自适应可在 ±10 分的初始软阈值范围根据覆盖度/重复度/密度调节，不得越过硬门禁、强制凑图或扩大预算。保留评分与选镜头原因；手动生成可绕过软分但不绕过安全/费用硬约束。
- **自动节奏**：全自动**默认关闭**，开启前需明确选择有效 Image Target 并授权适用额度；启用后默认“平衡”密度（高价值 Scene 通常优选 1 张）。节制模式约每 2～3 个有价值 Scene 选择 1 张，沉浸模式允许重要 Scene 多个不同 Shot。普通 Scene 自动软上限 1 张；存在独立高价值 Shot 且分数 >=90 时可考虑第二张。软冷却可因关键场景打破，**硬预算永不突破**。
- **可调初始硬额度**：用户启用自动模式后的产品起点：自动图片请求最大 **2 张/滚动 60 分钟、8 张/滚动 24 小时**，同一 Image Provider 自动生成并发默认 **1**，一次自动作业请求 **1 张**。Planner/Prompt LLM 共享单独预算：**8 次/滚动 60 分钟、24 次/滚动 24 小时、30,000 输入+输出 Tokens/滚动 24 小时**。这些都是用户可修改的产品默认设置，不是强行限制 Codex 测试、全项目任务进度或手动编辑数量的人工审批门槛。
- **付费与授权**：未明确批准正数的云端自动消费金额上限前，**自动付费预算为 0（禁止云端自动发送）**；用户启用自动模式不等于授权无上限扣费，缺可靠费用上界也不得静默自动付费。Cloud、参考图附加计费与本地 GPU 资源按可观测能力区分；预估费用不代表第三方实收账单。手动/半自动和自动的节奏/配额独立，但用户明确的全局付费上限覆盖所有模式。费用预留与作业入账须持久 CAS/事务保护，未知已提交状态保守占用预算。产品预算与仓库 Governance 开发测试 API 限额完全分离。
- **作业恢复**：区分可复用自动 `VisualIntent`、冻结请求的逻辑 `ImageJob` 和独立 `Attempt`；手动显式再生成有新的 Intent/版本，不被错误去重。持久化先于 Provider 外发；Worker 使用原子 claim、租约与 fencing epoch（建议初始心跳 15s、租约 60s，按实现可调整）保护并发/重启。状态按未提交、已有远端 Task ID 可对账、结果字节已到待发布、提交不确定、已发布分流；提交不确定且无远端幂等/查询证明时**自动停止重发**。AssetStore 与 ImageVersion 发布采用内容哈希、幂等 CAS 与 orphan 补偿清理，保留 SavePoint/分支/参考引用，不能把本地 cancel 当成远端退款或宣称不受 Provider 支持的 Exactly Once。
- **Reason**：使长期 RP 的镜头数量随场景价值变化但保持透明、可控费用与硬可靠性，避免固定楼层触发、多图重复收费、读档串图、崩溃后重复提交。
- **Affected modules**：[visual-director.md](visual-director.md) §7、[architecture.md](architecture.md)；未来 Scene/Shot Resolver、Director/Score、Budget/Job Ledger、Provider Reconciler、Session/AssetStore。
- **Scope limit**：以上已冻结**算法框架与可调初始默认**，并非锁定永恒权重或真机/Provider 实测结论。精确数据库/IR/API Schema、Provider 特定计费与远端取消/幂等协商、运行后的评分校准及媒体编辑细节**未由 D-008 批准**；媒体编辑架构范围随后由 D-009 另行冻结。

## D-009（2026-10-14，Round 9）— 分层 Native Media Studio 与不可变图片衍生 DAG

- **Decision**：用户选择**方案 C：分层 Native Media Studio + 不可变衍生图谱**，包含 B 的不可变 ImageArtifact/MediaOperation 来源/父子版本关系和 Gallery；在此之上将 Media Core、Provider 编辑执行、可视化 Media Studio/历史管理分为职责独立的模块，分阶段交付，不仅仅在现有 `Annotation.images[]` 填新字段。
- **操作范围**：将 **Regenerate、Img2Img、Inpaint/局部重绘、Upscale** 和图像版本查看/切换作为本次深化的**正式功能范围**。再生成是明确的新 Intent/Job/版本，区别于自动请求的幂等重放；图生图保留原图输入与原生参数；局部重绘记录源图/Mask/编辑指令/坐标；Upscale 区分确定性重采样与可能改变内容的生成式超分。实际支持哪个 Provider/模型/Workflow 的哪个操作，必须走 D-003/D-004 的 Capability Negotiation 和各自协议适配，不承诺任意模型天然支持。
- **非破坏性血缘**：原始 Blob/AssetRef 和每个衍生输出保持不可变；MediaOperation 记录 0..N 合法父图/引用图/Mask 等输入、实际 Target/Prompt IR/非秘密请求证据与对应 Job，形成不可变**有向无环图 DAG**，拒绝环和非法跨域引用。当前显示版本属于 Session/Branch/Annotation 的独立选择指针，不能因为编辑完成、读档或切换分支而覆写历史或正文。
- **Native Media Studio / Gallery**：独立编辑工作台负责预览、输入参数/Mask、提交编辑和查看版本差异；画廊按作品、Session、Branch、Scene/Shot、Actor、Provider 和编辑历史组织可达图片及经用户批准的参考资产，使用懒加载/缩略图以保证长会话流畅，不创建新的剧情事实存储。标准角色/风格/服装参考应有明确审批和权威作用域，剧情截图不得自动升级为全分支参考。
- **资产与存档权威**：复用并深化 Atria `AssetStore`、`ImageVersion`、Session/SavePoint 与 GC 引用，保护仍被原图/父子衍生、Mask、Reference、SavePoint、Branch、持久 Job 引用的资产；**隐藏、解除当前展示、软删除元数据和物理 GC** 是不同操作，不能仅因 UI 移除就删 Blob。图片编辑不修改已提交剧情、World/Memory/Actor 的事实。
- **可靠性/预算**：用户明确执行的编辑走 D-008 的持久 ImageJob/Attempt/远端对账/幂等发布，单次再生成生成新的明确意图；打开画廊或编辑器不触发隐藏收费请求。手动编辑可绕过自动选图节奏，但仍须满足模型能力、授权、全局付费额度和隐私/时点硬门禁；不允许静默更换付费 Provider。
- **Reason**：避免多轮 RP 中分支图片被覆盖、复杂局部编辑丢失原图/Mask、历史版本无法追溯、图片参考和存档资产被误清理；使不同图像后端共用正规衍生资产图谱和 UI 而非复制逻辑。
- **Affected modules**：[media-editing-gallery.md](media-editing-gallery.md) §4 为详细权威；[provider-protocol.md](provider-protocol.md) 为后端能力约束；[visual-director.md](visual-director.md) 为作业/预算；[visual-continuity.md](visual-continuity.md) 为角色/参考图权限。
- **Scope limit**：第九轮冻结**完整编辑操作类别及 Media Studio/DAG/Gallery 的架构方向和必须保留的安全边界**；**尚未冻结**第十轮的 Mask 工具/UI 手势、跨 Provider 编辑流程的交互/回退、具体版本操作与删除/GC 规则、存档闭包和参考图晋升细节、各后端特殊协议。高级视频剪辑、成熟 DCC 图层系统、未经授权的第三方素材及所有高级模型特性不因此自动纳入。

## 基线与合规约束（非单独由用户冻结的架构方案）

- Atria 当前 Native Session、插画呈现、AssetStore、Task Scheduler 是应审查并优先复用的已存在实现；“完全恢复旧 SD 插件作为主体系”并不是已选择的开发方向。
- st-chatu8 以 AFPL v9 分发，不得未经许可直接复制代码、预设与素材进入 Atria；可独立借鉴需求/交互。见 [静态审计](baseline-and-reference.md)。
- 这些是现有事实、工程约束与版权边界，**不等于用户额外批准了某项架构提案**。D-003/D-004 确定 Provider 抽象、范围和配置骨架；D-005 确定角色身份—时点状态—参考图的三层权威，D-006 确定证据混合更新/仲裁原则，D-007 确定分级 Director 与独立预算/可靠作业原则，D-008 确定 Scene/Shot、可解释自适应评分、可调产品初始预算与作业恢复精细策略；D-009 确定 Media Studio、不可变衍生 DAG、主要编辑功能范围与画廊/资产权威。具体 API/数据库 Schema、Provider 特例及交互/清理细节仍待议。

## Unresolved; **not** decisions

- D-009 已冻结再生成、Img2Img、局部重绘、Upscale、Media Studio 与不可变血缘/Gallery 的架构与功能类别；**Round 10 待定** Mask 绘制/坐标/修订交互、跨 Provider 具体执行、版本隐藏/删除/GC、存档闭包与参考资产晋升等精确规则，不能把范围批准误报为代码已实现。

- D-002/D-007/D-008 已冻结 Commit 后启动、跨回合 Scene/Shot、分级检测、可解释自适应评分、默认关闭的自动模式及软性节奏；**待定**：视觉画廊操作、产品 UI 的具体授权交互与运行数据校准。
- D-005/D-006 已冻结三层视觉权威、证据驱动混合更新、硬门禁/冲突审查与参考图按用途选择原则；精确阈值、状态持续/失效细节、Vibe/Reference 强度和特定 Provider 功能矩阵仍未定案。
- D-003 已冻结语义统一/Adapter/能力协商的分层原则；**实际请求/响应 Schema、能力配置及降级策略尚未冻结**。
- Round 4 后端家族、P0/P1/P2 优先级、三层配置与四级选择覆盖已由 D-004 冻结；**具体模型 IDs、协议参数、能力探测与默认生图 Profile** 未冻结。
- Img2Img/Inpaint/Upscale 功能类别已由 D-009 纳入本企划，**精确到各 Provider/模型/工作流的能力及编辑默认操作尚待细化**；Vibe/参考图专有特性、视频和批量生成的完整功能矩阵及进入阶段尚待分别决定。
- D-007/D-008 已冻结 Planner/Image 双账、滚动窗口默认、云自动付费默认零授权、持久队列租约/fencing/状态不确定不重发/幂等发布等策略；**待定**：确切表/字段与存储事务实现、Provider 特有请求对账和实际收费、资产 GC 的完整 Schema、后续可测校准。
