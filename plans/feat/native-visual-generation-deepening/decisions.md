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
- **Scope limit**：第七轮**只冻结上述方向与不可破坏的原则**。未批准具体场景分割算法、评分公式与权重、每次生成张数、软/硬频率、自动开关默认值、金额/Token 数字、预算周期、Job 状态枚举/事务 Schema、租约、各 Provider 重试次数或恢复时延。**第八轮再讨论这些具体策略**。

## 基线与合规约束（非单独由用户冻结的架构方案）

- Atria 当前 Native Session、插画呈现、AssetStore、Task Scheduler 是应审查并优先复用的已存在实现；“完全恢复旧 SD 插件作为主体系”并不是已选择的开发方向。
- st-chatu8 以 AFPL v9 分发，不得未经许可直接复制代码、预设与素材进入 Atria；可独立借鉴需求/交互。见 [静态审计](baseline-and-reference.md)。
- 这些是现有事实、工程约束与版权边界，**不等于用户额外批准了某项架构提案**。D-003/D-004 确定 Provider 抽象、范围和配置骨架；D-005 确定角色身份—时点状态—参考图的三层权威，D-006 确定证据混合更新/仲裁原则，D-007 确定分级 Director 与独立预算/可靠作业原则；具体 API、评分默认值及精细算法仍待议。

## Unresolved; **not** decisions

- D-002/D-007 已冻结正式提交后启动、分级场景候选与按视觉价值筛选、允许跳过；**第八轮待定**：具体场景分割、镜头评分、触发节奏、自动模式默认开关和审批交互。
- D-005/D-006 已冻结三层视觉权威、证据驱动混合更新、硬门禁/冲突审查与参考图按用途选择原则；精确阈值、状态持续/失效细节、Vibe/Reference 强度和特定 Provider 功能矩阵仍未定案。
- D-003 已冻结语义统一/Adapter/能力协商的分层原则；**实际请求/响应 Schema、能力配置及降级策略尚未冻结**。
- Round 4 后端家族、P0/P1/P2 优先级、三层配置与四级选择覆盖已由 D-004 冻结；**具体模型 IDs、协议参数、能力探测与默认生图 Profile** 未冻结。
- 图生图、局部重绘、Vibe、参考图、视频、批量生成的进入阶段与默认行为。
- D-007 已冻结文字规划与图片生成预算隔离、持久 ImageJob、远端对账、未知提交不自动重发和幂等发布原则；**第八轮待定**：精确评分/频率与预算数值及周期、持久队列租约/幂等键/恢复分类、Provider 特有重试/取消交互；图片引用 GC 的具体实现需按最终 Schema 验证。
