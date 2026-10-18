# Atria Native Orchestration V3 — 换设备交接

Updated: 2026-10-18。用户本轮明确要求停止当前工作、提供交接提示词，在另一设备继续。停止不代表任务完成；恢复后继续原任务，不新增许可/审查前置。

## 身份与真实 Git

- Task ID / Source branch：`refactor/atria-native-orchestration-v3`。
- 本机 Source：`/home/henry/Projects/Atria-worktrees/tasks/atria-native-orchestration-v3/source`。
- 本机 Docs：`/home/henry/Projects/Atria-worktrees/docs`，分支 `docs`。
- 最新 Source **f7b929151**（24 files，350+/74-），其父 **436cd1211**。WIP 是未完成的“分支内有界回环”，不是运行已通过的 checkpoint。
- 上一完整实现保存点 **436cd1211**；此前依次 `4f46b4afc`、`687e9f189`、`991ceef6a`、`7eef4c971`、`db0a432fe`。这些新增消费者均无当前运行验收，勿把“完整实现保存点”当 PASS。
- Docs 本交接提交的父版本 **d1b1edc83**。交接与同一 Record 一起提交到 `docs`，恢复时以真实 Git 为准。
- 不要使用会话默认 cwd `/home/henry/Software/deepseek-harness` 作为产品源码。
- 未合 main、未删除任务分支。换设备从上述远端分支恢复；本机绝对路径不是另一设备必须照搬的布局。

## 首先读取

1. 真实 Git status/branch/log；本 HANDOFF。
2. `records/refactor/atria-native-orchestration-v3.md` **末节**；早先原任务从 `94d677c6d` 与 Record“2026-10-18 — P5前端与组装”恢复的历史仍保留。
3. `plans/refactor/atria-native-orchestration-v3/index.md`、`acceptance-matrix.md`；涉及控制流读 `graph-control.md`，按需读原 D1–D8 / P1–P4 合同，不能靠改 Gate/阶段归属或删除有效断言完成。
4. Source/Docs AGENTS 与 Docs README §12.1。普通工程问题不暂停求确认。

## 用户最新约束

- **进一步减少验证，轻量甚至不运行验证**：停止 hash 指纹/逐文件摘要矩阵、CPU诊断、宽回归和 Browser 重跑；不重新组织庞大测试队列。只在直接改动确需时做最小语法/静态检查，不把验证当继续实现的前置。
- hash 已去掉内部每 call 的 JSON 重验、深拷贝、V8编码缓存，内部相等已改直接字段比较；不要重新造缓存/摘要权威。原持久化身份/必要完整性、授权/预算/CAS/unknown/正式 writer 必须保留。
- 六项后端问题已修复并专项通过，不能无故重跑。无新证据不得 PASS，历史 FAIL 不回标；旧宽组按其实际 Source 版本记录。
- 不新增独立审查、多轮交叉审查或审查专用子代理。之前独立复核已完成。可并发实际实现、避免共享文件冲突；本设备的三个工作代理已按换设备要求停止，另一设备不依赖它们的内存状态。
- 持续更新**同一** Record/Gate，区分实现完成、受限、真正未完成和 NOT_RUN；不新增假设需求、不无限扩测、不造第二 Host/权限/预算/领域数据权威。

## 已保存实现：到 436cd1211

- P5 六项修复与旧专项证据保留。角色独立 Audience 的 RP 协作、Game/Project 的 Planner/Review/Judge/DAG/Fanout/Join/委派/有界回路已有大量原真实消费者，不能以旧 Narrator/single-Agent 限制概括当前源码，也不能由有限消费者推导通用 G2 完成。
- `db0a432fe`、`7eef4c971`、`991ceef6a` 已削减重复 hash/clone/内部等值计算；三域 pending cancel/blocked、scope Judge→Agent、owned Actor child Context、递归已发布 advisory child Plan、整个已完成纯 Fanout/Join 的因果 Review 重做已接。
- `687e9f189`：三域 main/child 完成的纯咨询委派可经 Review 重新占用原银行额度并建新 child Run；旧 Return、子树与费用保留。Session 修 maxRequests 字段及变量遮蔽；RP 中间 Agent 同时接收原图 Result 与 child Return，预约 ACK unknown 保 reconciling。
- `4f46b4afc`：三域冻结 branch Review 可重做本 branch 非终端前置工作，后继及原 Join 终端保留 reservation/身份；不相关 sibling 不重跑。A2/R2 原 membership、Transition、反馈、历史与全费用保留；取消按全部实际 Frame 成员，覆盖尚未进入本地 Map 的新 Attempt。
- `436cd1211`：冻结 branch 内 Agent 可沿原咨询 Delegate/Handoff 发起已发布 child Plan，资源含递归模型闭包、银行包含真实子 allocation；私有父状态按实际 Run+Attempt 隔离。完整 typed Resolver/Return/TaskLocal 与原银行 descendant closure；Session/Project/RP unknown、ACK-loss 不退款/不误记 closed。
- 同次原 batch Model/continuation facts 私有复用，原银行仍 fresh；没有公开 proof/cache。整组 Review 保留先前 branch Review 已失效成员的旧 receipt 和费用。前置重做不得间接改掉已派发的冻结终端；历史绑定终端真正晚于原 Review 的 Transition。
- 上述各保存点有直接语法/ESLint/diff 检查，**新增 Runtime/Browser/benchmark NOT_RUN**，不称超时已解决。

## 当前 WIP：分支内已发布有界回边，尚未完成

**这批必须先接完，不能当已完成消费者。** 目标是在 Join 前，原 Planner `requestReplan` 沿同 branch 已发布 loopBack 回到非终端 Agent/Planner；新 Attempt/Effect 与原边访问/循环/轮次/费用继续累计，原冻结终端 reservation/身份保持。不跨 branch、不重开 closed Join、不重放已发/unknown、不改 Host/预算上限。

### Shared（Root 已写）

- `fanout-controller.js`：新增 `readFanoutReplanScope(tx, handle, root, planner, {decisionSeq=root.eventSeq+1,targetNodeId=null})`，返回原 `{frame,branch,barrier,join,fanout,target,loops,affectedNodeIds}`。复用私有局部 scope reader，affected 仅 forward-only 本 branch；live 必须原终端尚未准备/派发，cold 证明原终端实际 Transition 在控制决策之后、Join 后结算。
- `delegated-fanout-work.js`：可选 `replan: async ({tx,root,completion,progress,branch}) => {target,affectedNodeIds,loopBindings}`。领域回调应核原 Planner receipt、原 pure interval、scope 与额度。loopBindings 是原 loops 与当前 completion；共有 worker 只重排该 branch 因果节点，目标新 Transition，保原终端 reservation 和 inherited refs。
- `transition-controller.js`：scope 原 entry 再次访问时，允许复用原 Frame 已冻结的必需 task.result 依赖；不重新派发/计入 Fanout transfer。其它必需 port 不豁免。原 `advance` strict schema **无 allowLoopBack 新字段**；它本来通过 bindings/admitGraphEdges 支持回边。`allowLoopBack` 只在原 cold `assertOutputTransition` 使用。
- `graph-planner-completion.js`：scope 中另一 branch 合法调度 Patch 夹在 Model admission→Planner adoption 之间时，沿 `readGraphFanoutPublicationGraph` 核原冻结形状及所有 revision，再读真正 patch.previous/new +1 与原 Command/CAS；非 scope 原 exact 条件保持。
- Root 上述文件已分别语法/ESLint 通过；保存时全 tracked diffcheck 通过。不是全 WIP 语法或运行通过。

### RP（8文件 WIP）

- 已写 `native-rp-generation.js`、`rp-control-graph.js`、`rp-fanout-planner-contracts.js`、`rp-control-graph-work.js`、`rp-control-fanout-contracts.js`、`rp-delegated-fanout-contracts.js`、`rp-control-input-contracts.js`、`rp-delegated-quality-contracts.js`。
- 已接 scope loop 拓扑、Planner requestReplan/helper、main own loop/child adapter、冷输入 loops/原 Transition/同 Frame 与 History；child 共享原 lastOperations，不能因每次建 localWork 重置 no-progress。
- **明确剩余**：`fanoutReplan()` 的 `root.progress.attempts + models.length` 可能把仍保留原 reservation 的未执行终端重复计入；应按真实新 Attempt 数投影，尚未修。
- RP 所写文件 ESLint 曾通过，之后 cold 尾部编辑未作完整最终静态/diff 检查。全部运行 NOT_RUN。

### Project（4文件 WIP，缺口较大）

- 已写 `project-control-graph.js`、`project-fanout-planner-contracts.js`、`project-delegated-fanout-work.js`、`project-control-graph-work.js`。
- 已写 forward scope 拓扑/同 branch 非终端 loop 限制，原 Planner requestReplan/helper/pure interval 检查，`projectFanoutReplan` callback、child wrapper 与 main forced target/loopBindings/retryToken/null-reserved 初版。
- **未完成**：main/child cold memberInput loops/allowLoopBack/实际 Planner 请求证明；child History 的真实 scope decisionSeq/affected 集合及 pure replay；main/child budget/attempt 投影保留原 reserved 终端。此4文件本批没有语法/ESLint/Runtime 证据。
- `projectFanoutGroups` 同时被 Session child 使用；后续改动协调共享调用者，不能覆盖 Session 允许的回边形状。

### Session / Game

- 已写 `native-turn-orchestration.js`、`session-delegation-authority.js`、`session-agent-graph-profile.js`、`session-fanout-planner-contracts.js`、`session-fanout-contracts.js`、`session-delegated-fanout-contracts.js`、`session-replan-contracts.js`、`session-delegation-contracts.js`。
- 已接 scope Patch requestReplan/pure scope/Frame helper，main forced target 与 child callback，entry 回环不重用 running Fanout binding，cold 实际 loop/Transition 与 main/child History 本 branch affected。
- **未完成**：main/child completeSessionPlanner 的 Patch 预算投影仍用全局 `sessionReplanScope.affectedNodeIds`，须收成同 branch 视图；cold helper 目前用目标 Model publication/settlement 序号，须绑定已核原 Transition.decisionSeq；尚未整体收口。
- 此8文件语法/ESLint 通过，但运行 NOT_RUN，不得记为消费者完成。

## 后续顺序与当前 Gate

1. 先完成上面 WIP 的 live/cold/History/预算接线，尤其 Project 冷证明和 RP reservation 重计；不要从 scratch 重写原 Host 或重跑六项专项。
2. 按原冻结合同继续确有缺口的实现；scope 内动态拓扑、嵌套 Frame、跨 scope replan、冻结终端替换/已关闭 Join 的 sibling 重用仍受限。不要发明无依据的控制节点笛卡尔积矩阵，也不能把有限 Profile 当通用完成。
3. P6 旧四根及后续外围资产/三语教程/原测试迁移已清退并有旧版本必要证据；历史 agent-intelligence 已迁真实 Native，原 `069a4bd32` 的 43 suites/633 PASS、activation 11 PASS（含重叠，不另加633）、FS/SQLite retrieval24 PASS 归原字节。Native Skill 当前 Host→正式 Output activation 已有真实证据；eligible 价格/质量晋升 NOT_RUN。
4. 原新 child Review 最小正例 timeout、Project 前述 adopt/CAS 历史错误、P6 Browser Settings/旧 hub 两次 FAIL 均保留同一 Record。现导航/hub fixture已迁实际 UI，但用户要求轻量化后未重跑，不能称宽矩阵或 Browser 已全绿。停止的轻量 child 运行无 case 结果，不计产品 PASS/FAIL。
5. 最终平台、真实 Provider、价格/质量、必要性能/eligible 晋升等无证据保留 NOT_RUN。P3/P4/P6 **IN_PROGRESS**，最终 **NOT_READY**。没有整体验收证据不得擅自改为 PASS/合 main/删分支。

本机 `/tmp/atria-*` 仅原临时日志，通常不会随 Git 换设备；事实已记 Record，不把不存在的本机日志当另一设备已取得的新证据，不提交凭证或 Provider 原文。换设备恢复后继续实际工程，不自动增加审查或验证工作。
