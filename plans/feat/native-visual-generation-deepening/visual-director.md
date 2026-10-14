# Visual Director：自动场景选择、预算、作业可靠性（D-007 / D-008 已冻结）

- Task ID: `atria-native-visual-generation-deepening`
- **Status**: **Round 7 D-007 与 Round 8 D-008 均已冻结**：分级事件筛选、跨回合 Scene/Shot、可解释评分、可调的初始频率/预算、持久作业恢复。D-009/D-010 的明确再生成与跨 Provider 媒体编辑复用 ImageJob 账目，但具体 Mask/版本/Provider/资产方案详见 [media-editing-gallery.md](media-editing-gallery.md)。本模块的精确持久存储 Schema 与实际 Provider 计费协议仍待实施前确认。
- Frozen dependencies: [decisions.md](decisions.md) D-001（手动/半自动/全自动共用底层）、D-002（剧情已提交后 Director 才动作）、D-003（ImagePromptIR / Capability Negotiation）、D-004（Provider Profiles 与手动覆盖）、D-005/D-006（视觉身份/状态与可见性、证据混合解析）、**D-007（分级 Director + 预算隔离 + 持久可靠作业）**。
- Prior narrative/visual boundaries: [architecture.md](architecture.md)、[visual-continuity.md](visual-continuity.md)。
- Code baseline: `main@7e1045ab836c22cafbc92c5de056ad701f56e723`（只读 GitHub 源码；未运行测试）。

## 1. 现有系统可复用的能力与缺口

- `src/native/illustration-service.js`: 手动选段必须匹配已提交 Timeline/Variant；标注与 ImageVersion 保存由 SessionRepo 管理。
- `src/native/illustration-image-service.js`: 当前单标注图片任务在用户提交时执行；以 `sessionId:branchId:annotationId` 抑制同时进行中的重复提交，冻结连接/提示词和请求快照，失败或标注删除时防止错误显示，单次提交 `retry: false`。
- `src/native/illustration-prompt-service.js`: 提示词另走 `role.illustration_prompt` 并按任务提交，任务身份固定历史标注；可以为 Director 规划路由提供思路但不是自动画图实现。
- `src/native/task-scheduler.js`: 当前内存 `operations / queue / running`，具备 `interactive/background/maintenance` 等执行类、资源并发、取消、退避和 `finalizing` 边界；**该执行中状态不是可恢复的持久图像 Job Ledger**。不同 `src/atria-dispatch` 的聊天请求断链恢复不代表 Native 插画任务已具备同等崩溃恢复能力。
- `src/native/repositories/asset-store.js` 与 `src/native/session-illustrations.js`: 有 Blob/AssetRef、ImageVersion、Branch 与 SavePoint 保护；可沿用结果持久化但需明确 Job 与资产发布的幂等事务关系。
- `src/native/session-core.js` 已有正式 Commit/Revision/分支及部分 `commitId` / invocation receipt；Director 应在正式 Commit 被承认后领取来源事件，不监听不稳定的 DOM/流式 Token。

## 2. 第七轮历史备选与已批准方向

### A — 定额触发

每次提交或固定 N 轮产生插画请求候选；可加简单冷却、预算，不引入复杂的场景价值评估。

优点：容易实现与测试，用户容易预测。问题：无意义楼层也画，重要高潮可能被频率门槛漏掉。

### B — 每次提交由独立 LLM 全量判断

所有新剧情的每次 Commit 均交给 Director LLM 做多画面提议/评分，再根据预算触发生图。

优点：理解复杂场景与镜头。问题：即便不画也反复调用 LLM，费用与时延大；可能重复生成、视觉导向取代叙事。

### C — 分级事件驱动 + 价值筛选 + 独立预算和可靠作业（已批准 D-007）

先由低成本机制识别新增的**可见且有价值**的场景变化/候选，包括场景切换、角色重要出场、服装/视觉状态变化、剧情高潮、用户显式指定等；必要时才调 Director LLM 评估视觉内容/选择镜头。对候选去重、按视觉价值/新颖度/连贯性筛选；遵循模式与预算许可发布图片任务，保持长期 RP 的插画节奏。未满足条件允许明确跳过而不消耗图像费用。

**定案：Round 7 的 C 已批准**。A/B 仅为历史对比；上文是在保留第七轮历史讨论文本，**Round 8 已通过 D-008 冻结初始评分、分割、频率、张数、额度与自动模式默认开关，具体规则以 §7 为准**。

## 3. Frozen directional pipeline (D-007; exact schemas/thresholds open)

```
Committed Revision/Visible Scope
  -> source/branch/display grant check (hard gate)
  -> cheap scene delta & candidate detection
  -> optional Director analysis (independent text LLM budget)
  -> scene identity / importance / visuality / novelty / repetition evaluation
  -> dedupe against existing approved intents and current/ancestor scene coverage
  -> model/workflow capability + user auto permission + independent image budget admission
  -> durable image job (prepare -> authorized -> submitted -> reconcile -> published)
  -> ImageVersion/AssetStore; no Narrative mutation
```

Suggested factors (not numeric formula):
- Scene/shot completeness, distinctive visual action, meaningful state change, narrative importance and new information that **may be shown**.
- Visual diversity and story coverage, per-scene repetition penalty, suitability for selected aspect/Provider, high-confidence available character references.
- A scene may span several turns; selected frames must match historical message/variant/span, not just final current world state. Allow manual override to request artwork even when automatic selection skipped.
- Image generation should never block committing the narrative. If budgets/target capabilities are unavailable, it must not silently fall back to a costly or semantically weaker Provider.

## 4. Budget separation frozen; quotas and defaults under discussion

**Planner budget**: Separate limit for Director / tagging / image-prompt LLM calls and tokens, plus timeout and optional cached candidate reuse. Cheap stage not required to call model for every turn.

**Image budget**: Separate permitted image generation requests/images, concurrency, approximate financial budget per target/connection, and optional session/work-level cooldown. Target price can be unknown; real charge may diverge from estimate, especially remote workflows, reference/Vibe encoding, re-generations.

**Admission**: User's manually configured authorization/mode; provider/target-specific estimates or caps, reservation before sending, observed actuals or best-effort receipt afterward, no silent cross-provider paid failover. UI should distinguish estimated vs billed/unknown, and support pausing automatic requests. **Governance §13.1 developer test API limits are not product image-generation budgets**.

**Not decided**: defaults, numerical limits, period window, charging unit, offline/local GPU cost accounting, model fallback, reserved budget lease persistence.

## 5. Durable job and recovery principle frozen; exact state schema under discussion

- Intent/job identity should be derived from stable source + scene/annotation/shot + selected Target + compiled request fingerprint, distinct from a random HTTP request ID.
- States to analyze: proposed, approved, queued, submitting, submitted(remote job ID), running, completed-not-published, published, failed, cancelled, stale and uncertain-submission.
- For queued/not yet submitted tasks, dedupe and reconstruct from persistent plan if still authorized/current; for submitted jobs with a remote query API, **reconcile by remote task ID** rather than resubmit and charge twice.
- If a request may have reached a provider but there is no verifiable remote job ID or idempotency support, enter **uncertain** and do not blind auto-retry. Present next action to user.
- Provider-cancel acknowledgement differs from local abort; cannot assume refunded or guaranteed stopped. ComfyUI shared-server/global interrupt must be scoped/safe.
- Result finalization should be idempotent with CAS and preserve old ImageVersion. Branch switched/deleted or stale source should never replace current selected image; invalid/outdated results may be retained as safe history only under future explicit policy.
- Crash/reconnect should not generate a second image silently; garbage collection must not delete assets reachable by SavePoint/branch/approved reference.
- Actual persistent storage mechanism, lease and claim protocol, retry/backoff/timeout, remote API specifics remain open.

## 6. Round 7 freeze and implementation boundary

正式权威：见 [decisions.md](decisions.md) D-007。下列步骤为**已冻结的设计方向**，实现细节不在本轮推导：

1. 正式提交的、可见的剧情来源 → 低成本变化检测 → 必要时 Director LLM 分析 → 视觉价值/新颖度/重复度判断 → 已授权模式/Provider 能力/预算检查 → 持久 ImageJob/远端对账 → 版本化 AssetStore。
2. 不值得画可直接跳过；不能每个 Commit 无条件调用昂贵的 Director 模型或图片 Provider。
3. Planner 的请求/Token/费用预算与实际图像生成的张数/请求/金额/并发预算独立；产品费用授权与开发测试 API 限额分离。
4. 任务持久化防重复、对远端确认过的请求优先恢复、无法判断是否已提交则停在 uncertain；不能把“后台运行正常”或本地 abort 误报为崩溃可恢复/远端已退款。
5. 手动重生成需要明确的新版本意图；正常自动重复触发不得制造额外账单。所有图片来源、结果历史、分支与 SavePoint 引用遵守已有 Native 不变量。

## 7. Round 8 已冻结：场景感知的自适应导演（D-008，方案 C）

2026-10-14 用户明确选择第八轮方案 C。以 D-007 为不可越过的底层原则，正式冻结：**基于正式剧情证据的跨回合 Scene/Shot、可解释的自适应评分与节奏、先授权再花费的双预算默认、持久 Job Ledger/租约/远端对账恢复策略**。以下数值均为可在设置中修改的**产品初始默认/校准起点**，不是不可更改的资源或测试审批门槛；实现须保留可解释的决策证据和最小相关测试。

### 7.1 Scene/Shot 的时序与稳定身份

1. **Scene 是跨已提交消息的连续叙事/视觉单元，Shot 是其中一个可绘制的具体瞬间**。场景判据综合已提交的地点、叙事时间框架、角色集合/出场关系、连续动作、事件目标/视觉状态等。单次 Commit 可有多个 Scene，多个 Commit 可延续同一 Scene；不以聊天楼层、单段长度或固定关键词为唯一分割条件。
2. **分级候选检测**：先检查正式 Revision/World State 与授权信息投影中的场景变化、状态差异和叙事显式事件；需要复杂语义判断时才调用配置的 Director LLM；无明确候选或重复内容可返回 `skip`，无需任何实际图片请求。
3. **场景边界**：清晰的时空跳转、地点/叙事焦点切换、现实/梦境/回忆/想象等 frame 切换、重要行动阶段变化会关闭旧 Scene 或派生有明确来源的 Scene；一般闲聊、同地动作连续或短暂镜头变化不必强行切分。时间跳跃/非线性叙事保留 `narrativeFrame` 与可核查的事件时点，不能用当前时刻的状态回填历史/梦境。
4. **稳定引用**：Scene 保存首次经确认的起点源锚、分支或祖先可达证明及 Scene 语义版本；Shot 保存准确的 `sessionId/branchId/revisionId/messageId/variantId/span`（或等价的 Native 正式内容锚），同一 Revision 内也按文本时序取对应衣着、伤势与人物状态。更新 Scene/评分可以派生新投影，但不变更已发布 Shot/ImageJob/ImageVersion 的来源。
5. **分支/重复**：共同祖先可复用确实相同且有权限的历史 Scene 证据，但分叉后新 Scene/变化不能借用兄弟分支事实；利用源锚/场景身份 + 已覆盖镜头索引进行幂等排重，不以“当前最近生成的图片”作为唯一判断依据。

### 7.2 可解释评分、镜头选择与跳过

先执行 D-005/D-006 的身份、时间、披露、素材许可与 Provider 必需能力等**硬门禁**，未通过则 `blocked` 而非以高评分豁免。

通过门禁的候选以 0..100 评分，五项可解释维度的**初始默认**如下（每维也为 0..100）：

```text
baseScore =
    0.30 * NarrativeImportance
  + 0.25 * VisualClarity
  + 0.20 * Novelty
  + 0.15 * VisualContinuity
  + 0.10 * CoverageNeed

score = clamp(baseScore - RepetitionPenalty, 0, 100)
RepetitionPenalty: default 0..30, grounded in same-scene / same-shot coverage
```

- **默认评分档**：`score >= 75` 为高价值可自动进入后续预算筛选；`55 <= score < 75` 为普通候选，视场景密度、未覆盖度与模式策略补选或等待；`score < 55` 自动跳过并保存可解释原因。分数是**启发式审美/叙事排序**，不是可信权限证明。
- **自适应**：根据最近**已提交、当前分支可达**的场景覆盖、重复比例和叙事密度，可在默认阈值附近小幅调整**软性**选图偏好（推荐初始区间 ±10 分），不自动提高硬频率/费用上限，也不降低 D-005/D-006 硬门禁。必须记录评分因素、来源、去重命中、实际阈值与跳过原因；不得为了强行凑够张数而降低要求。
- **镜头选择**：优先选择主体明确、动作/瞬间完整、视角可解释、位于准确剧情选段且不依赖后续信息的 Shot；多镜头候选对相同信息做重复惩罚。用户手动指派 Shot 可绕过**软性价值阈值**，但仍须通过权限/能力/预算硬检查。
- **特殊情形**：多个关键瞬间允许一个 Scene 内多个不同 Shot；一个旧 Shot 不能因后续场景扩充而变成未来内容；若缺少准确锚点或无法判断梦境/回忆的视觉事实，则候选暂缓或人工审阅。

### 7.3 自动节奏与初始设置

- **全自动生图默认关闭**。只有用户显式启用、指定可用 Image Target 和适用预算/权限后才能发起实际图片请求；没有生图连接或云付费许可时始终禁止自动外部请求。半自动需要用户批准候选；手动由用户提交，三种模式共用安全约束。
- **启用后的默认画面密度：平衡**，可切换“节制 / 平衡 / 沉浸”：
  - 节制：通常每 2～3 个**有价值且可见的 Scene** 至多优选一张；该间隔仅为软节奏。
  - 平衡：通常每个高价值且新颖的 Scene **优选一张**，一般不在同 Scene 多画。
  - 沉浸：重要 Scene 可选不同 Shot，仍要求显著信息增量和硬预算许可。
- **软性频率**：默认同一 Scene 自动生成 1 张；若有两个明显独立的重要 Shot 且后者 `score >= 90`，可候选第二张（非强制）。最近已有重复插画时提高普通候选阈值；突发高价值事件可以突破**软冷却**，但永远不能突破硬预算。
- **可调硬上限初始默认**（仅当用户主动启用全自动且目标可合法执行时生效）：每个滚动 60 分钟**最多 2 张自动生成图片**，滚动 24 小时**最多 8 张自动生成图片**；自动 Image Provider 并发 **1**；每个独立自动任务初始请求 **1 张**。计数采用保守的实际提交/预算占用，不能通过崩溃/重试重复重置。按用户修改的上限执行，绝非仓库 API 测试配额。
- **任务手动重生成**创建新的明确意图/版本，不作为旧自动请求的重放；可以不受自动节奏门槛限制，但仍遵守适用的总付费预算、Provider 能力和秘密/权限边界。暂停全自动默认停止**新自动作业入队**；既已授权且已提交的作业除非明确取消，继续按持久作业规则对账。

### 7.4 双独立预算与付费授权默认

1. **Planner Budget（Director/Prompt LLM）** 与 **Image Budget（真实图片 Provider）** 分离，分别记账并按真实目标能力治理。**规划 LLM 默认可调上限**：滚动 60 分钟最多 8 次 Director 分析、滚动 24 小时最多 24 次，滚动 24 小时合计输入+输出 Token 预算默认 30,000；只在低成本阶段发现真实候选时消耗规划预算，提示词整理调用纳入同一 Planner 账户。任务可使用现有 Runtime Route，但规划费用不占用 Image 请求额度。
2. **Image Budget 默认**：自动请求的张数/频率上限见 §7.3；云端金额预算需要用户**明确填写并确认正数上限**。**默认自动云端可消费金额 = 0 / 未授权**；未授权、无可校验报价上界或费用不足以在用户配置的硬上限内保证提交时，禁止静默自动发送云端请求，允许转半自动/明确授权路径。参考图编码、Vibe、远端工作流等附加收费必须计入可确认的授权范围。
3. **资源不同**：本地 ComfyUI 可按并发、GPU 资源/时长、张数管理（不能假定货币费用为零）；云端按可观测请求/张数/已授权估算费用管理。若 Provider 价格不透明，界面要明确“费用未知/仅估算”，不能声称实现绝对实际账单上限；自动付费原则为 fail closed，且仍不能保证第三方最终结算完全一致。
4. **预算事务**：作业实际提交前在持久账目中**原子预留**对应数量、额度及尽可能可审计的费用上界；同一 Intent 重放不能二次预留/发送。确认未发出才可安全退回预留；远端请求已送达或状态不明，须保守保留占用直到对账或明确人工处置。回执可以校准实际花费，不把本地取消误作远端退款。
5. **分类账**：手动/半自动与自动至少分离频率/节奏账目，用户指定的**全局付费上限**仍覆盖全部类型，不能用手动模式绕过硬金额权限。开发测试限额遵守独立 Governance 规范，不得加入用户生产预算。

上述数值为**可调产品初始默认**，而非固定业务配额或开发测试上限；Provider 级上限、用户主动启用的不同配置以及成本不透明时的安全策略仍可按实际契约细化。绝不在未授权时以“默认 8 张”为由自动扣费。

### 7.5 Durable Job Ledger、幂等键和崩溃恢复

**必须独立持久化的作业身份**：`VisualIntentId` 表示一次有来源的画面意图；`ImageJobId` 表示已选择 Target 的逻辑生成任务；`AttemptId` 表示该 Job 的一次 Provider 发送/恢复尝试。自动来源使用稳定的源 Scene/Shot + 源快照/语义指纹 + 自动生成逻辑槽作为去重依据，不因后续修改 Target/Rendering Profile 便自动再消费一次；用户主动重新生成须有全新的明确意图/版本 ID。Job 冻结 Source、Actor/Reference/Target/IR、授权/预算快照、协议能力和原生非秘密请求指纹。

**建议持久化状态机边界**：

```text
proposed -> awaiting_approval -> queued -> submitting
         -> submitted -> running -> result_received
         -> publishing -> published
or: skipped | blocked | failed | cancelled | stale | uncertain_submission
```

- **持久先于外发**：创建/授权 Job + 预算预留先在可靠存储中以事务/CAS 提交，再通过 Worker 发送；Worker 使用数据库原子 claim / lease + fencing epoch，防止进程重启、多个 Worker 或过期租约同时发送/发布。默认建议续租心跳 15 秒、租约 60 秒，需根据实际 Provider 异步模型配置验证，不能认为租约到期就证明远端没收到请求。
- **提交边界**：在发送前持久记录 `submitting`、稳定 client idempotency key（仅在 Provider 支持时真正传给上游）；获得远端 Task ID 后持久记录 `submitted`。提交期间掉线、无 Task ID 的 `submitting` 作业必须判定是否有可信“未发送”证据，否则进入 `uncertain_submission`，**禁止无条件重试**。
- **可恢复分类**：`queued`/明确未提交可在重核授权、预算、可达源/能力后重新 claim；`submitted`/远端异步作业根据可验证的 remote ID 恢复轮询/WebSocket/查询；`result_received`/已保存 bytes 尚未发布，可校验内容哈希、重新做幂等 AssetRef/ImageVersion 发布；`published` 直接复用，不重新计费；`uncertain_submission` 冻结自动重试并报告人工/Provider 核对入口。
- **结果发布原子性**：采用内容地址资产暂存 + 版本状态 CAS / 幂等关联，在不可分布式事务的 Blob/数据库边界提供**补偿和恢复路径**；重复 publish 不增加重复 ImageVersion 或覆盖用户已选的其他版本。清理 orphan Blob 必须等待事务状态与引用 GC 审核；SavePoint/Branch/角色参考引用继续保护。
- **失败、超时、取消**：区分网络拒绝/请求肯定未发、429 与重试期、已进入远端队列、远端取消已确认/不确定等。仅在幂等或明确未提交、有预算可用且 Provider 允许时自动重试；失联或超时不意味着 Provider 未计费。取消 UI 只能承诺本地状态或已核实的远端行为，不能声称上游已退款。
- **长会话/性能**：Director/Job 独立于剧情阻塞任务；缓存投影与场景覆盖索引可重建且版本化，不能修改 Narrator/World/Memory 或跨存档拿未来数据。上游结果迟到须绑定原 Scene/Revision/Branch 并按可见性与当前选中版本政策决定展示。
- **验证要求**：模拟进程/Worker 在提交前、提交后无回执、获得远端 ID、下载结果后与发布阶段被杀；对每个状态验证无静默重复请求、账目不双计、版本不重入、跨分支不串图；不把第三方没有保证的 Exactly Once 当作测试通过条件。

### 7.6 冻结边界与后续未决事项

D-008 已冻结上述 Scene/Shot 组织、评分框架、节奏档位、可调的初始默认、双账目/云费用授权门禁及 Durable ImageJob 分支恢复原则。**需要后续轮次继续细化**的内容：正式 IR/Job/预算数据库精确 Schema、Provider 不同的真实收费/额度协议、更多评分样本的校准、具体 UI 操作与图像编辑功能矩阵。评分权重和初始数字是可调起点，允许以实测为依据校准，不为达标设立新的用户审批或工程停工许可。

## 8. Round 9 历史展望（现已由 D-009～D-011 定案）：media derivations / gallery

下一轮讨论图片再生成、img2img、inpaint/局部重绘、upscale、画廊与长期版本化资产管理。应重点权衡：
- 重新生成是同一 Annotation 下的新 ImageVersion，还是所有操作都生成衍生图谱；画面/版本选择能否不改变已提交剧情或误选当前 Branch？
- Image-to-Image 与局部重绘如何记录原图、Mask、参考图、编辑意图、模型参数、工具流程与结果版本；Provider 不支持能力时怎么提示/允许人工替代？
- Upscale 是否保持原始像素/尺寸/含义不变，是否保存放大后的版本与原图引用；避免悄悄覆盖原始资产。
- 画廊如何按作品/Session/Branch/Scene/Actor/Provider/编辑历史查找、预览、选择版本与批量操作，同时保证 SourceRef/SavePoint/GC 的引用完整性。
- 编辑预算是否从自动节奏额度分离，手动操作始终受全局收费权限控制；是否支持跨 Provider 的合法衍生而不自动丢失来源证据。

**本段是 D-008 当时的历史展望**；后续 D-009～D-011 已正式冻结编辑操作、Mask/Gallery/GC/SavePoint 的架构与中立协议，详见 [media-editing-gallery.md](media-editing-gallery.md) 和 [media-precision.md](media-precision.md)。D-013/API 具体合同与未决在 [e0-closure-audit.md](e0-closure-audit.md) 追踪，不能把旧展望当成仍未批准。
