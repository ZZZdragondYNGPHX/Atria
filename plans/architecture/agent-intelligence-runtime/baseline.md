# 最新 main：能力、接入点与缺口

> 本分支只供企划编辑；状态与旧工程阈值不作为执行依据。正式恢复和工程验证使用 docs 分支的 Plan / Record；API 仅限每日 2000 次、20 RPM。

- Inspected: 2026-10-06
- Product: `origin/main@ed1fd90521a63363e29856601abbf5e908c99d10`
- Source research: `origin/docs@2e57f83b19d2321260be93f98dbbf5321f4b0b84`
- D0 核对时本地 main 与远端一致、工作树干净。D2 再次 fetch / pull 后产品 HEAD 不变；main 的 AGENTS.md 与 docs 治理 / 模板已有未提交修改，隔离保留。三份新增研究使用同一产品基线。

以下代码路径均相对于该产品 HEAD；可用 `git show <HEAD>:<path>` 复核。研究建议不能反向改写为代码现状。

## 1. 执行与结构化结果

| 接入点 | 代码事实 | 真正需要补的部分 |
| --- | --- | --- |
| `public/scripts/lib/agent-runtime/{runtime,state,contracts}.js` | 稳定 run / step / effect identity；JSON-safe checkpoint；权限 allowlist；handoff、fanout、取消与恢复 | 跨 run 的目标、经验与认知生命周期 |
| `agent-runtime/context-compiler.js`、`prepared-context.js` | 统一 context 编译及预算；恢复时重新 recall / 校验 memory freshness | typed cognitive refs 的受限展开及同等 freshness 检查 |
| `public/scripts/lib/orchestration-engine/policy-controller.js` | 纯 policy state；图指纹校验；budget、planner、rerun、并行、结果引用 | 从评价数据驱动的策略选择，不需要第二个 planner |
| `orchestration-engine/results.js` | 已有 `value`、`structured`、`provenance`；输出不限于字符串 | schema / 来源实体 / 长期有效性 / 作用域的统一消费语义 |
| `orchestration-engine/projection.js`、`agent-runtime/projection.js` | 允许列表只暴露执行元信息，排除 prompt、参数、结果正文与 credentials | 不能把 UI projection 直接当成完整训练轨迹 |

**对原报告的细化：**“Agent 间通信不应写死成 text”是合理长期约束，但当前引擎已经有 JSON 和结构化结果。问题是中间 adapter 的文本化、内容展开和长期来源，不是替换整个执行内核。

## 2. 两条产品入口的证据与恢复

### RP / Director

- `public/scripts/agents/orchestrator/run-state/store.js` 是当前运行投影；`review-feedback.js` 的批准 / rerun feedback 主要服务当前 run。
- `runtime-checkpoints.js` 使用 IndexedDB durable checkpoint，打开时会 prune 24 小时前数据。恢复 checkpoint 不能直接充当长期 Experience repository。
- `persistence.js` 有按消息锚定的完成 snapshot / capsule，不能将现状描述为“完全没有运行持久化”。
- `runtime-trace-export.js` 将已有事件导出为 JSONL，序列化失败会跳过该事件。未来可靠证据写入需要显式记录缺失和失败，不能照搬此策略。
- `game-runtime-bridge.js` 的 `runDirector` 最终返回 `finalProse`，但 `trace: null`。需要把 runtime trace、Native request、消息 variant 与正式 outcome 连接起来。
- `director-default-prompt.js` 的 `epistemic_scout` 通过提示与建议映射知识边界；它不是自由文本每条 claim 的确定性拦截器。

### Project Agent

- `src/native/project-agent.js` 的 `ProjectAgentService` 使用 `_tasks = new Map()`。plan、timeline、repair、review 状态存在于进程内。
- `prepareReview` 构造 Workspace，验证 / Preview / simulation 后进入 Review；`commit` 通过 Studio 的正式提交路径产生 change set。
- `public/scripts/native/studio-agent.js` 维护浏览器 transcript、Skill 调用和模型轮数；完整任务并非由 RP 的 AgentRuntime 驱动。
- `src/native/adapters/generation-host.js` 已核对 project task 的权限、baseRevision 和单次请求；`model-prompt-runtime/generation-service.js` 构造 request-owned exact snapshot 与 generation provenance。

**含义：**两条入口需要不同捕获 adapter。Project 的长任务恢复必须补齐持久状态及写入幂等；不能只给 RP 加 event subscriber 就宣称双方都有长期成长。

## 3. Native 权威与持久 substrate

| 接入点 | 可复用语义 | 不能直接泛化的边界 |
| --- | --- | --- |
| `src/native/session-core.js` | snapshot、revision、branch、CAS publication、authority / action receipts | 新状态必须进入已有校验和写权限路径；不能通过任意 statePatch 绕过 |
| `src/native/repositories/common.js` | stable JSON hash、immutable / mutable resource writes、integrity CAS | 不是所有主体共享同一种 revision；Project revision 与 Session revision 需分域 |
| `src/native/task-artifact-authority.js` | trusted host 捕获 exact input、production anchor、task hash、dependency fingerprints；消费核对 branch、scope、reuse、once | 目前绑定 Package 的 task / variant / resultPolicy / invocation；不是通用认知消息总线 |
| `public/shared/native-task-contract.js` | 4 类 executionClass、typed input/output、明确 sink、uses / reuse / cardinality | cognitive artifact 不应自动获得 world mutation 权限 |
| `src/native/task-scheduler.js` | 并发、resource permit、queue、retry、timeout、supersede、retention | operation / Promise 存在进程内；不等于持久 timer 或 Goal lifecycle |
| `src/native/lifecycle-authority.js`、`adapters/generation-host.js:executeLifecycle` | revision-backed durable outbox、scope epoch、幂等 invocation；Host 重启后恢复 pending intent | Package lifecycle 的固定 contract 不能原样套到所有 Project Goal |
| `src/native/simulation-authority.js` | 私有 candidate 的 deterministic bounded catch-up、task admission、currentness 检查 | 正式模拟与 hypothetical rollout 必须分开；预演不能 publication 或执行真实外部副作用 |

因此持久目标应复用 durable intent + 现有调度执行，而不是另建一个后台循环。跨 Project 的续跑要显式接入现有 Host / Store，没有事实依据宣称已自动具备。

补充持久化边界：`src/storage/engines/types.js` 明确 SQL 使用真实事务，而 FS 的跨资源写入失败不会回滚；`fs-engine-transaction.js:putResourceIfMatch` 是 compare-then-write。
`native/repositories/common.js` 的写排序只覆盖当前进程。首批发布不能假定跨 Skill 文件、Prompt / Preset binding、预算和审计记录的一次全局原子提交，须使用有恢复依据的 commit-last 流程并验收各存储模式。
`src/endpoints/native-studio.js` 从 authenticated user profile 取得稳定 `handle`；Project 持久任务应使用该 owner，不能以浏览器连接或 client 提供的 owner 字段代替。

## 4. 角色与认知

- `public/scripts/native/studio-actors-editor.js` 已有 exact Actor ID、`profile`、`metadata` 和结构化 authoring。当前常见 profile 字段仍为 description / personality / scenario / examples 等文本。
- `public/shared/native-information-contract.js` 区分 truth / belief / thread / open_loop / memory / narrative，声明 Actor、sources、views 和 bounded graphs。
- `native-information-runtime.js` 读取选定 immutable snapshot，按 actor / participants 投影；belief 有 epistemic status 与信息 channel；context / display 的 exposure 明确分开。
- projection anchor 包括 session、packageVersion、revision、branch 与 scope epoch；rollup 校验 exact leaf fingerprint。
- `public/scripts/native/context-derived.js` 有 commitment、narrative、sourceRefs 与 producer，但 commitment 是派生叙事状态，不等于可自主完成 / 续跑的 Goal authority。

缺失的是标准化持续 BDI / appraisal / emotion / relationship / ToM 更新，以及事件如何改变 Actor 的因果证据。
这里有可复用的认知底座，不能笼统说“Character 只是一个字符串”，也不能将当前 belief projection 夸大为完整心理模型。

**两个区分：**“角色当前相信 X”可以有受控、持久的状态记录；“X 是世界真相”仍须由 World authority 证明。错误 belief 的存在不构成 authority 违规。

## 5. Memory、成长与版本发布

- `public/scripts/agents/memory/{read-api,source-provenance,provider-provenance,state-providers}.js` 已提供来源、支持关系、currentness 和 provider 边界。
- Memory 的既有 extraction / retrieval / temporal graph 不需要再复制为另一套 RAG；认知补的是 applicability 与行为应用。
- `public/scripts/iteration-library/tools/skill-iter-studio.js` 已有 Skill 候选、审阅、Apply-time expected hash 检查。Proposal Bus 也已有用户处理变更的流程。
- `src/skills/repository.js` 有 scope、installedHash 与文件级 expectedSha256；这不等于跨全部写入口的不可变 Skill 版本与 run pin 历史。
- `src/native/model-prompt-runtime/{resources,persistence,presets}.js` 已有精确 Prompt / Generation 资源。更新 latest 资源不会自动影响被固定旧 revision 的 Package / Route。
- `public/scripts/lib/agent-workspace/presets.js` 与 `engine-v2/preset-compiler.js` 管理现有编排配置。候选可以演化用户副本的已允许字段；不需要修改 policy-controller 源码。
- `public/shared/native-experience-contract.js` 中的 Experience 指 Package 的体验运行契约。Agent 的执行经验不能因为同名而写进该 contract 或现有游戏体验命名空间。

完整缺口是 `真实轨迹 → 反馈归因 → 隔离评测 → 精确候选版本 → 晋升 / 撤回 → 下一次运行验证`。既有编辑、Review 和单次 rerun 可复用，但不是已经完成该闭环。

## 6. 表达与扩展

当前已有 Native presentation / message projection、illustration provider、plugin / extension platform 与 frontend compiler。
Expression 应接入这些真实输出路径。语音、Avatar 与远程 Agent 的 provider 必须单独确认可用性，不能把内部新建一个空接口记为多模态能力。

六个 Plane 是逻辑职责图；本轮没有证据支持先将现有目录整体搬迁为六套新子系统。

## 7. 实际验证

本轮用 Node 24.18.0 执行了一次不依赖 Jest、没有服务器 / 模型 / 用户数据的 headless probe，复用仓库 `tests/agent-runtime/fakes.js`：

1. allowed tool → task-only handoff → JSON object final output；
2. checkpoint 不持久化 recall 正文，runtime projection 不包含 task 正文；
3. 未授权 tool 被拒绝且不执行；
4. 模型请求期间失效的 memory 导致失败且不执行后续 tool；
5. engine result 保留 structured / provenance envelope。

探针退出码为 0。它只验证以上路径，不能证明真实模型效果、磁盘持久化、浏览器恢复或所有 Native authority 正确。

`tests/node_modules/jest/bin/jest.js` 不存在，浏览器 smoke 还依赖 Playwright。没有执行 Jest、构建、浏览器或 Android / 真机验证，也没有为研究阶段安装依赖。

正式阶段可复用的 targeted suites：

- `tests/agent-runtime/{kernel,durable-recovery,projection,policy-controller,engine-kernel}.test.js`
- `tests/native/{task-artifact-consumption,information-runtime-p6,information-session-p6,task-runtime-p3,simulation-candidate,simulation-task,project-agent,project-agent-http}.test.js`
- `tests/native/{native-skill-platform,skill-invocation,prompt-presets,model-prompt-runtime-persistence,session-durability,save-system}.test.js`
- `tests/orchestrator/runtime-trace-export.test.js` 与 Director / Loop / Spec / Agenda 的对应集成测试。
- `tests/frontend/agent-runtime*.smoke.mjs` 和相关 Native / Studio browser tests。

## 8. 已有草稿与并行变更保护

已有 docs worktree 中存在未提交的 `plans/feat/agent-experience-evolution/`，本轮只读取 index 以及当前调研需要的 baseline / decisions，未修改、暂存或提交。
其入口提到的自动模式 / 三类候选选择不能替代本对话中的批准证据。它可作为 S01–S10 的设计输入，D1 决定整合方式后再处理。
本 Bundle 在从最新 origin/docs 创建的独立短期文档分支准备，避免覆盖该草稿。

## 9. D2：Generation / Routing / Sparse 接入复核

- Rechecked product HEAD: `ed1fd90521a63363e29856601abbf5e908c99d10`；Source docs HEAD: `40ce08a32`。本节是本轮读取代码的事实，不是新实现或测试结果。

| 代码接入 | 当前事实 | 正式企划要补的部分 |
| --- | --- | --- |
| `model-prompt-runtime/route-resolver.js` | Route 固定 Model / Connection / exact Generation / Prompt；校验 owner 域、角色与 origin；capability 合并有 provenance / unknown override | 有限候选 + policy 求解；boundary-specific freshness；adapter 可 render 与 gateway 真支持分开 |
| `model-prompt-runtime/generation-service.js` | Context / Prompt IR、token admission、immutable snapshot；fallback 保持工具 / 输出 authority；Secret 仅 send frame | 执行决策 / attempt snapshots 和 response observations、完整费用；不替换已有 generation authority |
| `model-prompt-runtime/{contracts,context-providers}.js` | Prompt IR 与 Generation 分层，Capability 三态与可选 observedAt；Context Plan 有预算 / provenance；严格 schema | 语义 Creative / overlay、evidence scope / expiry、类型化迁移；不是任意添字段即兼容 |
| `adapters/provider-discovery.js` | 显式连接的非生成 discovery；OpenAI-compatible 列表不提供完整 capability，Anthropic / Gemini 读取部分声明 | 发现不成为 capability authority；有限主动 probe 和 observed rejection 分层 |
| `adapters/{http-generation-provider,native-messages-provider}.js` | 各自原生 reasoning / tools / schema lowering；stream 汇总 text / tools；当前 normalizeResponse 不返回完整 usage / reported identity | stream usage / cost / gateway 路径要补 adapter 观察；现有 metadata 不能当完整经济证据 |
| `adapters/generation-host.js`、`run-control.js` | Host 在每次 provider.send 前 charge；含 role retries / fallback attempts；Native RunControl 有 turn / lane / background windows 与 highWaterTurn，恢复不凭 save 重建 allowance | 在既有计数与 identity 上补 tokens / economics / 跨入口 reservation，不能说当前没有实际发送预算 |
| `task-scheduler.js` | class 优先级 / aging、公平 resource permits；scheduler retry；cancel 后 worker 未 settle 继续持 permit | 跨 owner / task 的预算及 durable intent adapter；不另建常驻队列 |
| `public/scripts/lib/agent-runtime/context-compiler.js` | 无隐藏模型调用；纯编译、tokenizer、有限预算、memory / tools；legacyMessages 不静默截断 | 有版本 / freshness 的按需展开与语义 lanes，明确迁移 |
| `public/scripts/request-inspector.js` | 现有请求详情显示 timing、prompt / completion / total 和 cache-read / write，支持 wire request export | 不能据此声称 Native 所有请求已带同等 usage；接入新 target / unknown / attempts / charge 观察 |

相关最小验证入口：`tests/native/{provider-discovery,native-provider-matrix,generation-budget-p2,prompt-presets,model-prompt-runtime-persistence}.test.js` 与既有双入口 harness。D2 只读相关实现 / 契约 / 测试内容，未运行这些测试。
没有为本轮改动当前 Prompt / Route / 预算运行逻辑、注册产品资源、配置 gateway 或发送模型请求。
