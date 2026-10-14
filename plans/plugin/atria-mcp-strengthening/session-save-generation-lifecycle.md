# Atria MCP 补强 — Session / Save / 长会话 / Generation 生命周期（第六轮冻结）

- **Task ID**：`plugin/atria-mcp-strengthening`；Primary Workspace `plugin`；本模块作为 `docs` Plan Bundle 的第六轮权威。
- **讨论选择**：2026-10-14 第六轮 **B：完整分层会话生命周期**。本轮只冻结设计/风险/验收方向；代码尚未实现、测试尚未执行。
- **源码复核基线**：`main@9241325a7290e613e0fdaaa1870409105c161c89`，`plugin@ee99b2b3d1c65502a971495a6016ccb7c195bf6d`。实现前须复核真实 HEAD、API 形状、失效/成本守卫。
- **依赖与跨域权威**：[index](index.md) · [能力矩阵](capability-matrix.md) · [P0 执行/Receipt/Journal](p0-reliability.md) · [模型/Provider](model-prompt-runtime-provider.md) · [Memory/Goals/Evolution](memory-goals-experience-evolution.md)。

## 1. 冻结总原则

1. **正式 Session 是唯一会话历史真值**：`Session / active Branch / immutable Revision / Timeline Entries+Variants / State+Knowledge snapshots` 的写入由 `SessionCore`、`SessionRepo` 以及 Package/RunControl/Continuity 等原生权威完成；`SavePoint` 只锚定已提交 Revision，`.atriasave` 是另一个可移植归档边界。
2. **MCP 不拥有另一份聊天历史**：不建独立消息数据库，不直接改旧 Timeline、floor/swap、用户原始存档，不允许用 SillyTavern `swipe/delete/hide`、数组截断或偷偷修改现有楼层代替存读档；旧 Legacy 显示投影不得成为 Revision authority。
3. **必须正确区分三套状态**：`Session/RunControl` 是持续业务记录与约束；`NativeTaskScheduler` 是 Host 进程内临时队列/运行时操作；`MCP Journal` 只是外部 Invocation 与原生 ID/效果关联。第四种 `GenerationProjection` 仅展示尚未提交的临时流式文字，不得保存成已提交消息。
4. **操作按副作用而非名称分类**：读取真实 Session Snapshot 与 Work 状态优先提供纯 READ；现有 `SessionCore.load` 在最新 HEAD 时可能同步 Package Regex/Knowledge 并发布 Revision，`RunControl.status` 可能持久协调状态。因此需专用无写观测 Port 或严格验证的纯只读路径；不能直接把任意 `/load` / `/run` 当严格纯 READ。
5. **失败、断联或 Host restart 必须先权威核对**：输入提交、Native Generation admission、Provider send/usage、Session/Task finalize 是不同阶段；丢失响应不能自动重发任何可能已经发送或提交的副作用。
6. **同一对象上的并发保持 CAS/锁**：MCP 的 Lane/Lease/Operation 只是外部约束；真正 Session HEAD、分支、RunControl 和 SavePoint 一致性由原生锁、source proof 和 expectedRevision/CAS 验证；两个 MCP stdio 进程不凭本地互斥获得全局写许可。
7. **阅读历史与修改体验分开**：读取旧 Revision、浏览 History、比较路线不切换当前 Branch；加载 Save 会创建新的派生 Branch。铁人模式、共享 Session、Continuity/Realm/Persona/PackageVersion 的原有限制一律优先。

## 2. 真实权威分层与静态发现

| 层 | 权威来源 | 已核查行为 / MCP 责任 |
| --- | --- | --- |
| Session root / Branch / Revision / Timeline | `src/native/session-core.js`、`src/native/repositories/session-repo.js` | HEAD CAS、不可变 Entries/Variants/State Heads、Branch 图与 Context ownership；MCP 只走明确语义 Action |
| SavePoint | `save-point-repo.js` / `NativeSaveSystem` | manual/quick/auto 保存已提交 Revision；Restore **新建 Route/Branch**，不擦除已有分支；MCP 回执固定 saveId/源 revision/新 branch |
| .atriasave Archive | `save-system.js`、`src/endpoints/native-product.js` | Snapshot/Session/Resume 导出，Package dependency preflight/import、资产 closure；不得与 SavePoint 混合，也不能将 binary/base64 塞进普通大文本回执 |
| Run state / ledger | `src/native/run-control.js`、Session state `atri_run` | 权威 Run access、foreground/background charge、Compute/Local work/历史与 Task continuation；铁人/死亡/终结限制不被绕过 |
| Transient worker | `src/native/task-scheduler.js` / `native-generation.js` | 队列、运行、流式、取消、最终提交；运行态仅限当前 Host Boot；多客户端控制要能独立于长任务响应 |
| Long context / retention | `public/scripts/native/context-compiler.js`、`src/native/history-authority.js`、`session-maintenance.js` | 读取 Context lane/budget/source decision；领域 History checkpoint 与可达性 GC；不拿压缩结果取代 Timeline 事实 |
| Provider continuation | `src/native/model-prompt-runtime/runtime-checkpoint-store.js`、`public/shared/native-session-task-history.js` | 仅用原生绑定恢复私有 Provider continuation；不能把 checkpoint 当 Worker 正在运行、也不能公开 providerState |
| MCP Control | `plugin:atria-mcp/src/{read-authority,mutations,kernel}.js` | 目前保存/恢复/Session 读有覆盖，但部分命令漂移；外部记录只保留最小 ID/hash/权限与核对线索 |

## 3. 必须修复：独立 MCP 的旧 fork/retry 合同漂移

**代码证据**：当前 `plugin:atria-mcp/src/mutations.js` 在以下 Action 里向 `POST /api/native/session/command` 发送 `command.type = 'fork'` 或 `'retry'`：

- `chat.branch.fork` 使用 `fork`；
- `chat.restart.from` 与 `chat.remove.from.active` 使用 `fork`；
- `chat.retry.prepare` 与 `chat.regenerate` 使用 `retry`；
- `chat.reenter` 使用 `fork`。

当前 `main:src/endpoints/native-session.js` 的 `/command` 明确只支持 `timeline, runtime, lifecycle, realm, continuity, turn.finalize, proposal.resolve, restore, switch`，没有 `fork` / `retry`；`main:SessionCore` 有正式 `restoreSavePoint` / `switchBranch`，不会接受任意历史楼层重写。因此这些注册的 MCP 动作当前是静态合同**不兼容**，真实 E2E 故障尚未执行复现。

**冻结处置**：

1. 实现时 **移除/退役**上述旧 `fork/retry` 的不兼容执行实现，不通过给 `main` 增加旁路旧命令、数组删除或“伪装 branch”兼容层解决。为了避免已废弃 Action 仍显示 `available`，同步更新 Registry/Reference/测试/客户端说明。项目仍为开发中产品，无需维持失效旧指令的空壳。
2. 将用户意图重映射到**已经被产品权威支持且语义相符**的操作：SavePoint Restore（新 Branch）、existing Branch switch、在真正有已授权 typed Native reply variant authority 时的非破坏重试。**不存在正确原生接口时明确 unsupported**，不得偷偷选择附近一个 Save/Revision 并宣称“同等效果”。
3. 用户要求“从某楼层重开”时，需先证明有可用的 committed boundary/Revision 和对应 SavePoint 或正式 fork authority；不允许任意截断当前 Timeline。为了常用场景新增权威能力也必须是不可变 Revision/新 Branch 的产品接口，并附 CAS/RunControl、历史保留与测试。
4. `chat.send` 当前是“先提交用户 Timeline，再 `turn/start`”的两阶段操作，部分成功就应清楚返回 `input_committed, generation_unknown` 等分层结果。扩展正式 CommitId/InvocationId 和精确原生 Receipt 核对，不允许“失败 → 再追加一次用户楼层”。
   实施收口：审批前通过纯 Native Turn preflight 固定 Session HEAD、Package contract、已选 Route/slot binding、模型/连接目标与预算；输入提交后由原 Commit Receipt 证明唯一 parent/user append，再进入受控 Turn start。每次真实 Send 前重核原批准配置；MCP 专用入口抑制未批准的 Visual/Simulation/自动学习模型级联，复用原生 Turn runner，不改变普通产品入口默认行为。成本与重试统一遵循 [Runtime 执行边界](model-prompt-runtime-provider.md#7-显式付费执行provider-fallback-与预算隔离冻结)。
5. P0 中增加静态合同检查（已注册 Action → Route method/path + command type），检测任何 `plugin` 与 `main` 不一致、未注册 404 / 400 不可用却对外声明 available 的情况。

## 4. 第六轮 Session / Save 语义 Action 目标

本表冻结操作覆盖与风险，Action 名称仅为候选，准确 Zod/schema、调用边界与代码实施前再冻结。

| 动作族（示意） | 风险 | 精确影响和约束 |
| --- | --- | --- |
| `session.list/get/read.snapshot/read.revision` | READ（仅当确证无副作用） | owner/session/packageVersion/revision pin、按需读取与脱敏，显示历史但不打开/切换到旧分支 |
| `session.timeline.range/message` | READ | 使用原生 `/timeline` 分页/按 ID，不拉整段长会话，不暴露跨 owner 的历史 |
| `session.branch.list/get/history/compare` | READ | branch parents/fork points、Revision/Save link、archived/metadata、历史可达性 |
| `session.save.list/policy.inspect` | READ | SavePoint 的 kind/anchor/时间与当前 auto policy |
| `session.save.manual/quick` | MUTATE | 当前 committed HEAD，expectedRevisionId、owner + Run mode + Save anchor；不可从临时 streaming draft 存档 |
| `session.save.policy.update` | MUTATE | Session-root metadata 的 expectedRevision CAS、定时/保留配置合法性与 UI 显示 |
| `session.save.restore` | MUTATE | 固定 saveId/revision/branchId → 创建新 Branch/revision，老分支完整保留；产生新 epoch/失效来源 |
| `session.branch.switch` | MUTATE | 切换已知 Branch Head，expected HEAD/Run mode guard；Preview 不是切换 |
| `session.branch.rename/archive` | MUTATE | 修改的是元数据或可见性，不删除历史；必须使用原生 `experience-metadata` 等权威 |
| `session.export.snapshot/session` | 敏感导出 READ + 受控数据出境 | owner/PackageRef/附件来源、绝不输出 password/私人内容到普通 Receipt |
| `session.import.preflight/apply` | READ+INTERACT / MUTATE | Package dependency/content hash、archive integrity、内容大小与权限，导入前单独审批 |
| `session.maintenance.inspect/trigger` | READ / INTERACT | Reachability/Gc proof，触发原生维护而非任意资源删除 |
| `session.delete/save.delete/revision.gc` | DESTRUCTIVE（按实际行为分类） | 原生明确入口、引用分析、精确 owner/目标、一次性批准；无原生安全写入口则不开放 |

- `SavePointRepo.maybeAutomatic` 默认 `enabled=true, intervalMs=300000, retain=12`，在**正式 Turn commit 后**触发（非流式每段/每 Token 保存）。用户 SavePolicy 可明确更改，MCP 不另起独立计时自动存档系统。
- 删除过期 Auto SavePoint 只是回收存档锚点，**不等于**删除旧 Branch/Revision；任何 Revision 的物理回收还必须通过 `SessionRepo._reachableRevisions` 与资源依赖完整性检查。
- `.atriasave` 支持 Session、Snapshot、Resume 多种归档用途，含媒体/Package/Knowledge 依赖；传输沿第二轮 P0 **有界 Asset Handle + 完整 SHA** 方案，不放宽任意路径读取。加密归档密码不得记入 MCP Journal/日志；导入应先 Preflight。
- 铁人模式或死亡终结 Session 的 `rewind/export/save` 等遵从当前 `RunControl.assertRunAccess`，不能用 MCP 直接读写底层 repo 绕过。

## 5. 纯 READ 与潜在状态协调端口的分离

已经静态发现：

- `SessionCore.load(handle,sessionId)` 在读**当前 HEAD**时可能应用 Package Regex / Knowledge 修订并调用 `_publish`，所以不是在所有情况下都零写入；
- `RunControl.status` 在非只读状态下可能将修正后的 control 写回存储，`SessionCore.runStatus` 还可能清理 terminal tombstone；
- 一些 `session.health`、`generation.status`、History/Scope 观察接口仍需按实际调用链和权限证明是否只读；不能仅凭 HTTP GET/POST/name 推断效果。

**实施契约**：为 MCP 严格 READ 优先复用/新增专用 `snapshotObserve`、`runObserve` 或相当的有界 Native read authority，关闭自动同步/repair/metadata 写和业务模型调用；若某 read path 只有副作用版本，不包装为 READ，允许 `INTERACT`/MUTATE 或标 `unavailable`。读完整大 Session 用原生分页/固定 Revision 访问，不经一次性几 MB REST/LLM 返回。

纯 READ 观察包含 `observedHeadRevisionId`、`branchId`、`packageVersionId`、`serverBootId`、`readOnly` 与相关快照证据；历史 Revision 只证明该时点，与当前 HEAD 不可混同。

## 6. 长会话 Context、分层 History 和 Continuation（冻结）

- **原始 Timeline 永久语义与模型窗口分离**：长会话必须通过原生 `ContextCompiler` 的 lane budget、selected/rejected source、Memory/Knowledge/History coverage 管理本轮输入；不得用摘要覆盖原始历史、用旧楼层 Hide/Delete 偷偷降低 Context。
- 可补 MCP `session.context.preview/diagnose` 为**真正无写纯观测**目标：读取 exact Revision + Role + Target + Route + Token limits，返回每类 lane cap/used/reserve、selected and rejected source IDs、覆盖水位/过期证据、被截断原因、候选调优建议。不能将私人 Prompt/聊天全文无约束流入外部模型。
- `HistoryAuthority` 的 hot/warm/cold/archive 是领域结构化事件及 provenance 摘要，`checkpointHistory` 清理**派生** Action/Task/History 状态并保存 retiredInvocation 信息，**不会**删除不可变 Timeline、Branch 或可达 Revision。不能把 checkpoint 完成解释为“历史已物理清理”。
- `Session Task History` 的工具回合和 Compaction 有专属上限（`tasks=8, messages=54, rounds=6, bytes=65536, summaryBytes=8192` 于审计 HEAD）；这些是**单个 task tool transcript 的契约**，不等于用户整段会话长度限制或 MCP 自身操作次数限制。
- `RuntimeCheckpointStore` 的私有 Continuation 数据有独立 owner/资源指纹/过期/容量权威（审计时 `ttlMs=600000`，其他限制参考真实源码）；只表示恢复符合条件的 Provider opaque continuation **上下文**，不能恢复已终止的 worker / 自动重发模型请求。
- 不能把 Memory Graph、Knowledge、History、Prompt Stage 归并成 MCP 独立“万能压缩器”。跨读档/换支 ContextPlan 必须重新编译并验证来源，没有自动迁移已失效证据。

## 7. 多阶段 Generation 与分层 Receipt（冻结）

`NativeTaskScheduler` 已区分 `queued/running/streaming/retrying/finalizing/completed/failed/cancelled/stale`，其默认并发/队列/retention 由当前 Host code 持有；进程重启后 operation 不必继续存在。MCP 必须映射：

1. **请求/输入提交**：用户 input 的 `Session commitId / messageId / revisionId` 或正式 Task intent；持久 ACK ≠ 下一步模型已发。
2. **Native 执行 admission**：RunControl access、有效 Branch/Revision、Route/Provider/Token/Compute budget 与 TaskScheduler operation identity。
3. **Provider 发送/Streaming**：可能已计费、可能无 Usage 结果；流式文本/临时 projection 不属于历史写入。
4. **Native finalizing**：无条件不可破坏的产品 CAS 提交窗口，Stop 不能回退已通过授权的原生 finalization；失败保持实际 conflict。
5. **权威完成**：正式 Session Revision、Action/Commit Receipt 或 Task stored result，另行附 Usage settling status 与 Preview/Client delivery 证据。

**RunControl** 的 operations/budget/attempts/task history 属持久来源；`TaskScheduler` 的 `operationId` 属短期 Host Boot，`MCP Journal` 记录三层映射和待核对状态而非另建一份业务 Task。status 查询无权重发/触发 pay model。

- `generation.start` 应选择 Native `/turn/start`、`/task/start` 或已明确上下文的 `/execute`，按真实语义分类，不能把 standalone `/execute` 的文本当自动已提交 Timeline。
- `generation.stop` 发送单次正式 Native cancel，返回 `cancel_requested/confirmed/no_longer_cancellable/unknown` 等实际事实；正在 `finalizing` 时 cancellation false 不能解释为已回滚。
- Browser/MCP 断线之后 Native detached Task 可以继续至提交，但是不能保证 Host restart 后继续计算；要区分“进程仍在运行”和“产品已记有历史/预算/回执”。
- 同 `sessionId` 上旧请求和新 Branch/Restore 的竞态必须由产品 HEAD CAS 决断。并发异步工作发生 source stale 时不能将旧 Provider 文本发布到当前 Branch。
- 若宿主 SDK/API 是否发起过上游请求无法确认，保持 `unknown` 与预算保留，不在 MCP 端自行 retry/Fallback，不得将未知 Server Boot 的 Operation ID 当当前排队任务。

## 8. Stop、自动存档、读档、GC 的并发顺序与恢复

- **正常完成**：固定 committed Revision → 在该事务作用域内完成业务/回执 → **Turn 提交后**原生尝试 Auto Save；AutoSave 失败仅返回真实 diagnostic，不回滚已经完成的 Turn，也不声称存档成功。
- **SavePoint 创建**：只引用当前正式已提交 HEAD 且守卫 `expectedRevisionId`，不得读/持久化正在生成的 provisional text；跨 MCP 实例同一 HEAD 的重复 Save 是两个不同存档，不能凭显示名冒充同一个 ID。
- **Restore/Branch Switch**：独立 MUTATE 与可信审批，原生 `rewind` gate，新的 Branch/HEAD 后应撤销旧 Browser Experience Epoch/Memory 相关权限、过期 Preview/Context/Retrieval/Lease；在目标精确版本重新读取产品真值。
- **Auto Save / GC**：遵守已生效的原生 SavePolicy 和 Session Maintenance Mark/Quarantine/Sweep + read lease。维护数据依赖 Session HEAD、所有可达 Branch/Revision、SavePoint、Illustration/AssetRef、RunControl 等，旧存档锚点清理不自动扩大为物理删除。
- **维护授权**：MCP 默认仅能读取维护状态/触发已存在的、经过资源与权限校验的原生维护操作；不得自行选择“过期 Revision”并从 StorageEngine 中删除，更不能从原始文件系统清理。
- **Ironman / shared / Continuity**：遵从产品已有 terminal/dead/pending/rewind 拒绝语义；共享视图与 owner 写入是不同权威，不能用 Admin/Network client 绕过 RunControl。

## 9. 断线/重启后安全核对（冻结）

| 中断/触发 | MCP 可以安全执行 | 禁止推断与自动操作 |
| --- | --- | --- |
| 用户 input commit 未收到 ACK | 根据事先生成的 `commitId` / origin RequestHash 查询原生 `/commit-receipt` 与 HEAD | 没查证就重新 append |
| input 已正式提交，`turn/start` 回执丢失 | 查 Session timeline/Commit Receipt、RunControl/Invocation、当前 Native Operation | 第二次 append 相同用户楼层或自动重新付费 Send |
| Provider 可能已接收请求 | 标 `unknown`，留预算/trace，允许显示只读排查 | 把 HTTP timeout 当未发/免费重试 |
| Session finalize 返回丢失 | 核对 Action/Commit Receipt 或当前 Branch/Revision，检查 fingerprint/owner | 以本地模型文本或 SSE 完成当成原生 commit |
| Stop、Timeout | 区分取消请求与确认、是否进入 finalizing，显示实际是否有已提交版本 | 宣称退费、删除旧提交或回滚数据 |
| MCP restart | 读 Journal 的非敏感 ID/hash，重建客户端与 Host scope，查询原生历史；过期 Lease 需新审批 | 恢复旧 MCP Lease、自动重新运行未确认写入 |
| Host restart | 原 NativeScheduler operation 往往不存在，读 RunControl/Session/Task/Save 确认持久结果与未核实状态 | 伪造 Worker 继续运行或抹除 `unknown` |
| 用户切换路线或读档 | 当前 Branch/Revision 与所有原批准 SourceGuard 重检，stale 时返回受限失败 | 继续把旧生成/Memory/Goal 内容提交新路线 |

注意当前 `src/native/session-core.js:appendTimeline` 对 `commitId` 有去重/回执查询，`SessionRepo.commitSnapshot` 也保存正式 CommitReceipt；**不是所有 `/command` 或业务动作都天然携带调用方独立的 CommitId**。实现要区分“可直接利用已有幂等 key 的入口”与“须新增正式 Product Authority/提交身份的入口”，不能凭 MCP Journal 的 ID 宣称产品端也实现 exactly-once。

## 10. 第六轮验收计划（规划，未运行）

1. **合同一致性**：Registry 扫描中不得再把 Native Router 未实现的 `fork/retry` 作为 available；合法 Save/Restore/Switch 与无语义对应的 Regenerate、Restart/Remove 场景分别返回正确结果/unsupported。
2. **历史保留**：从 SavePoint Restore 产生新 Branch，新旧 Branch/Timeline/World/Memory/Package 及附件不被覆盖；仅 inspect 旧 Revision 不改变当前 HEAD。
3. **Auto Save**：默认与用户配置、快照 HEAD 绑定，连续快速 Turn、并发 Save、AutoSave failure 和 ironman 特殊状态验证；过期 AutoSave 清理不损伤可达历史。
4. **纯只读**：含 Package 现行 Regex/Knowledge 更新及 RunControl reconcile 的实例中，调用 MCP READ 后比较 Session/RunControl/Save/Revision bytes/heads，须完全无持久改变。
5. **长会话**：Context Compiler 的 included/rejected、lane/cap/coverage、Memory 来源、Prompt Preview 与 Token 预算可解释；History Checkpoint 与 Session Task transcript 压缩后仍能读原始 Timeline。
6. **任务生命周期**：Input commit → Native admission → Provider send/stream → finalization → formal Receipt/Revision；单步故障注入、HTTP/SSE 断开与不同 Client status/cancel。
7. **Stop / Restart**：在 queue、streaming、finalizing、MCP restart、Host restart 后精确区分已提交、pending、unknown、cancelled/不允许取消，绝无盲重发与错误费用核销。
8. **GC/资产与权限**：Mark/Sweep 读租约、断点续接、全部可达 Save/Branch/Illustration/Task/Attachment、并发新引用和失败恢复；普通浏览器/客户端没有原始文件删除能力。
9. **跨域影响**：Branch restore 后 Browser Epoch/Memory provenance/Goal anchor/Context plan 与 Evolution 来源失效，旧 Lease/Preview 不准复用；操作记载诚实且按权威状态核对。

所有结果在真正实现/联测时再写入本任务唯一 Record；静态源码审计和远端文档提交不能冒充产品测试。当前阶段不要求手动真机或额外外部帐号授权。

## 11. 第七轮待讨论（非本轮已冻结细则）

受控 Browser/UI：现有 Playwright 观察、截图、滚动、权限拒绝的点击/输入等动作；Native Frontend Host Bridge、Experience Epoch、Studio Preview、source/role/owner 与真实客户端人工审批语义。需要决定哪些 UI 操作保持纯观察，哪些可增设受控交互，如何绑定截图证明、Mask/Canvas/复杂编辑与真实 Product Authority，如何避免凭截图替代 Native validation/Commit。
