# Visual Director：自动场景选择、预算、作业可靠性（Round 7 讨论稿）

- Task ID: `atria-native-visual-generation-deepening`
- **Status: Round 7 open / candidates only**。以下方案没有得到用户批准，不可当作实施指令。
- Frozen dependencies: [decisions.md](decisions.md) D-001（手动/半自动/全自动共用底层）、D-002（剧情已提交后 Director 才动作）、D-003（ImagePromptIR / Capability Negotiation）、D-004（Provider Profiles 与手动覆盖）、D-005/D-006（视觉身份/状态与可见性、证据混合解析）。
- Prior narrative/visual boundaries: [architecture.md](architecture.md)、[visual-continuity.md](visual-continuity.md)。
- Code baseline: `main@7e1045ab836c22cafbc92c5de056ad701f56e723`（只读 GitHub 源码；未运行测试）。

## 1. 现有系统可复用的能力与缺口

- `src/native/illustration-service.js`: 手动选段必须匹配已提交 Timeline/Variant；标注与 ImageVersion 保存由 SessionRepo 管理。
- `src/native/illustration-image-service.js`: 当前单标注图片任务在用户提交时执行；以 `sessionId:branchId:annotationId` 抑制同时进行中的重复提交，冻结连接/提示词和请求快照，失败或标注删除时防止错误显示，单次提交 `retry: false`。
- `src/native/illustration-prompt-service.js`: 提示词另走 `role.illustration_prompt` 并按任务提交，任务身份固定历史标注；可以为 Director 规划路由提供思路但不是自动画图实现。
- `src/native/task-scheduler.js`: 当前内存 `operations / queue / running`，具备 `interactive/background/maintenance` 等执行类、资源并发、取消、退避和 `finalizing` 边界；**该执行中状态不是可恢复的持久图像 Job Ledger**。不同 `src/atria-dispatch` 的聊天请求断链恢复不代表 Native 插画任务已具备同等崩溃恢复能力。
- `src/native/repositories/asset-store.js` 与 `src/native/session-illustrations.js`: 有 Blob/AssetRef、ImageVersion、Branch 与 SavePoint 保护；可沿用结果持久化但需明确 Job 与资产发布的幂等事务关系。
- `src/native/session-core.js` 已有正式 Commit/Revision/分支及部分 `commitId` / invocation receipt；Director 应在正式 Commit 被承认后领取来源事件，不监听不稳定的 DOM/流式 Token。

## 2. 本轮待选择的总体策略

### A — 定额触发

每次提交或固定 N 轮产生插画请求候选；可加简单冷却、预算，不引入复杂的场景价值评估。

优点：容易实现与测试，用户容易预测。问题：无意义楼层也画，重要高潮可能被频率门槛漏掉。

### B — 每次提交由独立 LLM 全量判断

所有新剧情的每次 Commit 均交给 Director LLM 做多画面提议/评分，再根据预算触发生图。

优点：理解复杂场景与镜头。问题：即便不画也反复调用 LLM，费用与时延大；可能重复生成、视觉导向取代叙事。

### C — 分级事件驱动 + 价值筛选 + 独立预算和可靠作业（讨论建议）

先由低成本机制识别新增的**可见且有价值**的场景变化/候选，包括场景切换、角色重要出场、服装/视觉状态变化、剧情高潮、用户显式指定等；必要时才调 Director LLM 评估视觉内容/选择镜头。对候选去重、按视觉价值/新颖度/连贯性筛选；遵循模式与预算许可发布图片任务，保持长期 RP 的插画节奏。未满足条件允许明确跳过而不消耗图像费用。

**本节 A/B/C 均为候选**，未冻结触发门槛、评分权重、调用频率、每次生成张数或默认自动模式。

## 3. Candidate pipeline (not approved contract)

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

## 4. Budget dimensions under consideration

**Planner budget**: Separate limit for Director / tagging / image-prompt LLM calls and tokens, plus timeout and optional cached candidate reuse. Cheap stage not required to call model for every turn.

**Image budget**: Separate permitted image generation requests/images, concurrency, approximate financial budget per target/connection, and optional session/work-level cooldown. Target price can be unknown; real charge may diverge from estimate, especially remote workflows, reference/Vibe encoding, re-generations.

**Admission**: User's manually configured authorization/mode; provider/target-specific estimates or caps, reservation before sending, observed actuals or best-effort receipt afterward, no silent cross-provider paid failover. UI should distinguish estimated vs billed/unknown, and support pausing automatic requests. **Governance §13.1 developer test API limits are not product image-generation budgets**.

**Not decided**: defaults, numerical limits, period window, charging unit, offline/local GPU cost accounting, model fallback, reserved budget lease persistence.

## 5. Durable job lifecycle and failure recovery candidates

- Intent/job identity should be derived from stable source + scene/annotation/shot + selected Target + compiled request fingerprint, distinct from a random HTTP request ID.
- States to analyze: proposed, approved, queued, submitting, submitted(remote job ID), running, completed-not-published, published, failed, cancelled, stale and uncertain-submission.
- For queued/not yet submitted tasks, dedupe and reconstruct from persistent plan if still authorized/current; for submitted jobs with a remote query API, **reconcile by remote task ID** rather than resubmit and charge twice.
- If a request may have reached a provider but there is no verifiable remote job ID or idempotency support, enter **uncertain** and do not blind auto-retry. Present next action to user.
- Provider-cancel acknowledgement differs from local abort; cannot assume refunded or guaranteed stopped. ComfyUI shared-server/global interrupt must be scoped/safe.
- Result finalization should be idempotent with CAS and preserve old ImageVersion. Branch switched/deleted or stale source should never replace current selected image; invalid/outdated results may be retained as safe history only under future explicit policy.
- Crash/reconnect should not generate a second image silently; garbage collection must not delete assets reachable by SavePoint/branch/approved reference.
- Actual persistent storage mechanism, lease and claim protocol, retry/backoff/timeout, remote API specifics remain open.

## 6. Questions for Round 7 user decision

1. Should the system use **A fixed cadence**, **B full LLM evaluation**, or **C hierarchical event-driven value filtering** as its fundamental Director strategy?
2. After adopting a strategy, subsequent rounds should define scene segmentation and shot choice, quality/cost/latency weights, automatic approval boundaries, limits, durable job claim/recovery, and UI explainability separately—not infer exact schema or prices from this outline.
