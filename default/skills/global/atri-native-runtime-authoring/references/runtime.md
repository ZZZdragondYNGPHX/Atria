# 运行时设计

## 回合与 Model Task

读 catalog `messages`、`tasks`。Turn envelope、canonical message、选定 Variant 和展示 receipt 各有用途。先选择 Task 的结果去向：给本轮补充上下文、生成展示内容、留下可采纳的建议，或通过固定 Command 写入应用状态，再配 input/output schema、binding slot 和 Variant。

`authority-first` 先确定行动结果再叙述；`narrative-outcome` 通过已声明的 Interpreter 提取语义结果。两种模式都由运行时落实事实，正文负责把发生的事情写好。不要为了结构化处理，把叙述写成执行日志。

需要后续复用的模型产物可声明 `resultPolicy.uses`，分别用于 `rule_input`、`operation_proposal` 或 `context`，并选择 revision/branch 范围及一次性或可复用。上下文用途是可复用的只读消费；已写入 Turn、App Command 或直接采纳的结果不再作为未采纳产物重复消费。

## 剧情 Workflow

读 `lifecycle` 和 `story-workflows`。剧情脚本写在 `experienceContract.lifecycleRuntime.workflows`：用 `user_gate` 留下玩家介入点，以 `action` / `projection` 推进片段，确有生成需求时接 `model_task`，最后走向合适的 `terminal`。一段来访、约会或委托可以自然结束，不必强行接上下一场危机。

把“是否答应”“是否抵达”等条件接到已有事实；Workflow 发起请求，由对应领域规则决定结果。台词、Scene cue 和等待节点本身不替角色同意、移动或付款。

- `when` 支持事实比较与 `all` / `any` / `not`；`automatic: true` 由现有 Lifecycle pump 推进。
- `wait_for` 从节点进入时计相对 ticks；`wait_until` 指向绝对 tick。暂停 scope 后恢复，按实际时间和事实继续。
- `interrupt: true` 配合 `when`，用于人物离开、条件变化等真正中断；符合条件的中断优先于普通出口。
- `model_task` 出口可用 `taskStatus` 区分 `draft`、`applied`、`completed`、`rejected`。例如候选被拒绝后重新商量，而不是沿成功分支继续。

需要“生成近期候选，再决定是否采用”时，把候选放进已有内容 Domain；固定 Command 的 `validators` 可以用当前记录 `world` 与输入 `args` 检查是否仍适用。验证器只读自身记录；跨领域决策使用已有 Authority transaction。离开节点后，未完成的旧任务不再推动新节点，已发生的事件留在历史里。

## App 写入与后台生成

Domain、Command、retention、scope 与逻辑时间属于版本化声明。App 写入使用 typed Command 和 expected revision；logical time、World time、墙钟与 Host 活跃 elapsed 分别表达不同时间。

已确定要执行的后台生成可用 `resultPolicy: { resultClass: 'declared_app_command', sink: 'app_command' }`，对应 `background` Task 和 `fifo` 队列。Variant 固定绑定结果去向：

- `app.command`：声明 `domainId`、`commandId`，可带 `recordId`；输出 schema 与 Command args 一致。普通绑定省略 `recordId` 时，由 Host 生成稳定记录 ID；由 Simulation job 调用的非个人任务则指定固定 `recordId`。
- `interaction.schedule`：声明 `interactionId`，输出为 `{ recordId, dueTick, args }`；使用该 interaction 的 Clock、maxDelay 和 Command args。
- `cognition.appraise`：为已暴露事件生成情绪、关系及可选的他人心智判断；绑定事件 view、目标 Domain/Command 和评价 profile，使用契约中的专用输入输出结构。

人物自主思考可用 `app.command` 的 `subjectPerspective`，由 Simulation job 绑定当事人；此时不写固定 `recordId`，Task context 只取 `input` 与个人 `projection`。它同时需要 Simulation 与 generation budget 声明。模型给出当前人物的意图或评价，具体行动仍由相应规则执行。

## 世界推进、开局与生涯

从 `capabilities` 读取当前 ExperienceContract。`world-simulation` 与 `authority-transaction` 一起声明；Simulation 使用 canonical clock，把到期事务或后台 Task 放进已有 jobs，由运行时按 policy 推进。同一时钟上的绝对期限也归这份 job schedule，不再另挂 `world.schedule`、interaction 或 `wait_until`。日历跨度和计算工作量不是一回事，长年跨度不必拆成逐 tick 的模型调用。

开局通过 `storyStart` 指定确定性的事务和叙述字段；生涯终止通过 `runPolicy` 引用实际死亡事务及 outcome。当前 `runPolicy` 不能与 `continuityRuntime` 或 `sharedRuntime` 同时使用。`generationBudget` 对应已声明的回合计数器与生成额度，按作品需要配置，不另造后台调度器或预算账本。

## Activity 与 Scene

读 `presentation` 的 Activity 输入、outcome、settlement 和 Narrator 声明。一次小游戏、仪式或交互用 start/pause/resume/settle/cancel 表达生命周期，结算走已声明的 App 或 World Command；提交事实与 narrative handoff 后，再由指定 Narrator Task/Variant 描写结果。取消叙述不撤销已经完成的结算。

Scene 使用受限 Cue IR 与现有 renderer；caption/speech 是文字。选择作品需要的 Host 能力，required 能力参与 Ready preflight，optional 能力配合适的呈现替代。fullscreen、speech 等沿用 Host 的用户激活和 scope 生命周期。

检查本次实际改动即可：定义和分支可用 Studio Simulation、recorded Task 查看，排版用 Preview。记录结果时区分这些模拟与真实模型、音频或设备上的表现。
