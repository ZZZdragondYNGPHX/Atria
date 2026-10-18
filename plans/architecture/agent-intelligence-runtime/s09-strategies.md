# S09 — 原编排参数候选

- Task ID: `agent-intelligence-runtime`；仅 S09，沿用产品分支。
- Status: Complete；依据 [M1 §7–9](m1-evolution.md) / [delivery S09](delivery.md)。

## 冻结的有限目标

ordinary RP 沿原 Workspace Preset settings / Plan compiler。用户副本显式声明 allowed fields；一个候选只改一个已有整数参数：Loop / Director 的 `budgets.maxSteps`（1–64）；Spec / Director / Agenda 的 `budgets.maxConcurrency`（1–16）；Agenda 的 `scheduler.maxPlannerRounds`（1–32）或 `scheduler.maxTotalRuns`（1–64）。不开放没有相应 host consumer 的字段。

候选保存完整 base / desired definitions、声明 identity、单字段 diff、完整 base binding table 和单一 character / conversation subject。原 binding 保存 optional `strategyVersionId`。禁止 global / default / builtin、与 Prompt candidate 同时选择或在已 pin binding 上准备组合候选。下一 preparation 由原 compiler / host profile读取 exact definition；当前 profile / run clone不热改。未知 / missing / corruption 不 fallback。16 candidates / 64 declarations / metadata ≤2 MiB；容量拒绝，不自动淘汰。

Project 复用原 ProjectAgentService 的 Task creation 参数 `maxRepairRounds`（1–当前 server cap，cap ≤10）及原 durable ProjectTaskRepository。候选只作用于 authenticated owner + Project + **尚未开始的单一 Task**，不是 Project-wide 默认配置。Task 必须 planning、无 plan / attempt / proposal / workspace；完整 task base（仅排除 repository sequence 与本候选 metadata）及 project baseRevision固定。显式声明绑定当前 server cap；单候选保存完整 base / desired 与 diff。原 task的 maxRepairRounds 是唯一有效值，metadata 只保存候选和选中版本，不建立平行配置 authority。Task 开始后禁止 apply / rollback，运行使用原已接受参数；后续 Task 沿原 creation参数，不自动继承局部改进。服务上限漂移、Project revision漂移、task修改均冲突。

## 启用、撤回和持久边界

声明撤销阻止新 apply；已生效版本可继续原消费者读取或显式 rollback。rollback只在完整当前 binding / pristine Task仍等于 desired时恢复冻结的 base；用户改为其他版本、基础配置漂移或已开始执行时拒绝。重复完整 desired / base可 reconcile，不覆盖用户修改。

Workspace复用单 browser client settings / debounce；不声称 cross-tab / Host CAS或durable publication。Preset save保留已选完整历史但阻止pending apply；原 bind清双方pin；delete清本identity候选 / declarations / pins。

不新增UI、后台job、模型请求或StorageEngine kind。S06 promotion仍ineligible；本阶段手动apply不是Evaluation资格。S10负责来源 / feedback / policy / 共享预算、Review / 自动发布 / publication intent及运行后监测撤回；本阶段参数候选的确定性回归不代表模型收益。
