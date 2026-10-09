# S09 — 原编排参数候选

- Task ID: `agent-intelligence-runtime`；仅 S09，沿用产品分支。
- Status: Complete；依据 [M1 §7–9](m1-evolution.md) / [delivery S09](delivery.md)。

## 冻结的有限目标

ordinary RP 沿原 Workspace Preset settings / Plan compiler。用户副本显式声明 allowed fields；一个候选只改一个已有整数参数：Loop / Director 的 `budgets.maxSteps`（1–64）；Spec / Director / Agenda 的 `budgets.maxConcurrency`（1–16）；Agenda 的 `scheduler.maxPlannerRounds`（1–32）或 `scheduler.maxTotalRuns`（1–64）。不开放没有相应 host consumer 的字段。其它完整 definition 不变，包括 Prompt、工具 / capability、output owner、必要 guard、graph topology、arbitration、模型 / Connection / privacy。

候选保存完整 base / desired definitions、声明 identity、单字段 diff、完整 base binding table 和单一 character / conversation subject。内容 hash 固定版本；原 binding 保存 optional `strategyVersionId`。禁止 global / default / builtin、与 Prompt candidate 同时选择或在已 pin binding 上准备组合候选。下一 preparation 由原 compiler / host profile读取 exact definition；当前 profile / run clone不热改。未知 / missing / corruption 不 fallback。16 candidates / 64 declarations / metadata ≤2 MiB；容量拒绝，不自动淘汰。

Project 复用原 ProjectAgentService 的 Task creation 参数 `maxRepairRounds`（1–当前 server cap，cap ≤10）及原 durable ProjectTaskRepository。候选只作用于 authenticated owner + Project + **尚未开始的单一 Task**，不是 Project-wide 默认配置。Task 必须 planning、无 plan / attempt / proposal / workspace；完整 task base（仅排除 repository sequence 与本候选 metadata）及 project baseRevision固定。显式声明绑定当前 server cap；单候选保存完整 base / desired 与 diff。原 task的 maxRepairRounds 是唯一有效值，metadata 只保存候选和选中版本，不建立平行配置 authority。Task 开始后禁止 apply / rollback，运行使用原已接受参数；后续 Task 沿原 creation参数，不自动继承局部改进。服务上限漂移、Project revision漂移、task修改均冲突。

## 启用、撤回和持久边界

只提供沿原编辑权限的 explicit inspect / declare / prepare / check / apply / rollback。声明撤销阻止新 apply；已生效版本可继续原消费者读取或显式 rollback。rollback只在完整当前 binding / pristine Task仍等于 desired时恢复冻结的 base；用户改为其他版本、基础配置漂移或已开始执行时拒绝。重复完整 desired / base可 reconcile，不覆盖用户修改。

Workspace复用单 browser client settings / debounce；不声称 cross-tab / Host CAS或durable publication。Preset save保留已选完整历史但阻止pending apply；原 bind清双方pin；delete清本identity候选 / declarations / pins。Project复用原task queue / repository integrity CAS；candidate与有效参数同一task document，保存失败按原reload恢复，Task删除 / user dump / restore沿原kind，read-only只可inspect / check。

不新增UI、后台job、模型请求或StorageEngine kind。S06 promotion仍ineligible；本阶段手动apply不是Evaluation资格。S10负责来源 / feedback / policy / 共享预算、Review / 自动发布 / publication intent及运行后监测撤回；本阶段参数候选的确定性回归不代表模型收益。

## 最小本地验收

验证original compiler / host / policy消费者、有限预算停止、完整base / scope / protected字段、Prompt组合拒绝、内容identity / missing / capacity、apply / rollback冲突、原FS / SQLite task/settings恢复和失败点、HTTP owner / read-only；只执行触及面相关本地验证。

S09 完成后进入 S10；通用执行流程见 [Governance §8](../../../README.md#8-task-lifecycle)。

产品 / tested HEAD `f740e65238d6c46575c1f9972735a1166ca1ec71` 已commit / push。最小本地验收8 suites / 105 distinct tests：Workspace策略21、Project策略16、原Project recovery33、Project authority4、Project HTTP4、Workspace Prompt14、Workspace Presets4、Native orchestration prompts9；重复不累加。11触及JS ESLint / product diff通过；实际Director / Agenda Engine / Studio loop、原server repair / Review / Commit guard、FS / SQLite settings / task reload与SQLite task dump / restore均有本地stub / authority证据。无新model / UI / 全量测试 / build / Android / 真机 / 外部DB / CI。下一仅S10。
