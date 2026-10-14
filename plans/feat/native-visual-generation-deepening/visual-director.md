# Visual Director：自动场景选择、预算、作业可靠性（D-007 已冻结 / Round 8 讨论）

- Task ID: `atria-native-visual-generation-deepening`
- **Status: Round 7 用户已确认方案 C（D-007），分级事件驱动、价值筛选、预算隔离和持久可靠作业原则正式冻结。** 第八轮的具体场景分割、镜头打分、频率/费用默认值和数据库恢复协议全部**仍为候选**，不得提前实施为冻结策略。
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

**定案：C 已批准**。A/B 仅为历史对比，不再是有效实施候选。**尚未冻结**触发阈值、分割/镜头评分公式、默认调用频率、一次生成数量、额度数值与自动模式默认开关。

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

## 7. Round 8 precise strategy proposals — **not frozen**

以下为下一轮待讨论的实现精度方案，**不是**因记录在 Plan 就获得的实施授权。

### A — Conservative deterministic pacing

- Scene 边界主要依赖可验证的来源消息/状态变更与分段；缺少清晰边界时暂缓自动画图，仅提供手动。
- 镜头主要由可解释规则决定；可调的定额频率上限 + 强制冷却与排重，尽量不使用额外 Director LLM。
- 固定、保守的生成阈值易测试，但可能忽略长回合里的多个关键镜头或自由 RP 隐含场景。

### B — Weighted score with fixed presets

- 场景分割使用正式时序/文本语义/角色/位置变化，再由轻量 LLM 判断重要候选。
- 对剧情重要性、视觉清晰度、画面新颖度、重复惩罚等采用可解释加权评分；默认以宽松/平衡/节制固定预设控制图量。
- 有可预测的默认设置，但长期剧情不同阶段可能需要手工调节频率/权重。

### C — Adaptive scene-aware pacing with hard budget caps (candidate recommendation)

- 将 Scene 视为**跨 Commit 的连续视觉单元**，允许一条已提交消息中有多个具时间/选段锚点的候选 Shot；新 Commit 可补充或闭合 Scene，**不**以楼层为唯一分割单位。
- 先基于授权且已提交的时间/角色/地点/动作、状态 Delta 构建 Scene Candidates；需要时再调用独立 Director LLM 对重要镜头排序。明确支持 `skip`，并记录原因与可手动覆盖入口。
- 在偏好画风、叙事密度和已有图覆盖度之间自适应调整**软性图像节奏**，同时强制遵守事先授权的**硬性图像/费用/并发与规划 LLM 预算**；手动与自动模式账目分开以避免无意消耗自动额度。
- Job 恢复按“未提交 / 已有远端 ID 可对账 / 已有本地结果待发布 / 提交不确定”分流；无远端确认/幂等机制时采用**自动不重复提交**而非伪造 Exactly Once 保证。
- 复杂度更高，需验收多回合场景合并、单回合多画面、时间倒叙、存档分叉、相似镜头去重、超预算与未知提交状态等情况。

### Round 8 subdecisions still open (for whichever strategy)

1. Scene/Shot 的稳定身份键、跨回合合并范围和“当前 Revision 内镜头所在片段”的取样办法；时间跳跃/梦境/回忆的分段。
2. 评分形式、解释字段、阈值/权重，以及与用户可手动覆盖的关系。不要把审美评分当成权限检查。
3. 自然场景节奏、软性冷却、硬上限与默认模式（全自动是关闭还是需要启用授权），本地 ComfyUI 与按张计费云 Provider 的预算差异。
4. Token/调用次数/费用与图像额度/金额/并发的独立账本、未知报价时的行为、跨 Provider fallback 的授权与每种模式预算共享/隔离。
5. Durable Job Ledger 的事务/租约、稳定幂等键、remote job reconciliation、已拿到 bytes 但未完成 AssetStore 发布的修复、取消与删除/SavePoint 保护。
6. 仅用户决定本轮精确策略后将其写入 D-008；后续如须落实具体数值表/Provider 差异再单独冻结，不在此提前授权。


1. Should the system use **A fixed cadence**, **B full LLM evaluation**, or **C hierarchical event-driven value filtering** as its fundamental Director strategy?
2. After adopting a strategy, subsequent rounds should define scene segmentation and shot choice, quality/cost/latency weights, automatic approval boundaries, limits, durable job claim/recovery, and UI explainability separately—not infer exact schema or prices from this outline.
