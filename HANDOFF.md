# 用户暂停 / 换设备恢复 — M1 尚未完成

- Task ID: `agent-intelligence-runtime`；Primary Workspace: `main`。
- 产品分支：`feat/agent-intelligence-runtime`，本地 HEAD `4fc2871f8b7cc9971efc064dc8bb94cc3c175377`；公开 upstream 目前到 `d1c793b38f4caf0eeddc9bb64c2fc00b86c3cfd8`。包内离线 bundle 含本地提交。
- 产品另有四个 tracked 修改和两个 untracked JS 文件，必须按包内 workspace-state恢复；它们是待完成工作，尚未提交。
- main checkpoint：`6ab12ba43c5b18bfec6df75c16456a4cb4497d3f`，未集成。
- Plan：[index](plans/architecture/agent-intelligence-runtime/index.md)；当前模块：[feedback §15/§16](plans/architecture/agent-intelligence-runtime/m1-feedback-evaluation.md)、[acceptance §12/§13](plans/architecture/agent-intelligence-runtime/m1-acceptance.md)。
- Record：[同一实施记录](records/refactor/agent-intelligence-runtime.md)，先读最新“用户明确暂停并再次换设备 — M1 未完成”。
- 私有入口：本包 `Document/`；不得覆盖旧报告、配置、密封字节、费用或历史时间戳。当前暂停由用户明确要求，不是阶段完成。

## 实际状态

F2完整双模型来源前置复核完成，sourceRun `run-1791549210360-d320b572`；六条正确基线保持原 trial/charge身份。第一次F3 run `run-1791549607555-d38e4ef9` 每域一次候选/三development完成，但两域一致candidate胜均0，负维度、分歧和一份invalid原样保留；未准入promotion，M1 pending。

已定位并修复新的 F3 比较协议缺少 exact controls校准，以及 Project 提炼指令未定位原 Studio公开执行槽位的问题。新协议 run `run-1791552826778-8fccb497` 每域只有一个主模型控制通过，随后第二连接HTTP530/主连接HTTP524中断；没有产生新候选。不得把此run当作F3/M1完成，不为旧有效负面结果重跑追分。

提交4fc2871f新增原worker的独立来源 paired observation工程端口，原生产source/promotion gates保持。未提交六文件补充 exact已付费控制恢复、九对新promotion执行/双评分、原私有审阅发布、下一请求消费与守卫回滚，真实流程尚未执行到这些步骤。依赖隔离目录 `Document/m1-f2-sealed-20261009-project-window12`，正文只能由固定worker读取，提炼器不可见。

## 已执行验证与暂停检查

最近最小本地 F3 25/25、promotion门槛11/11、F2 source28/28通过，相关ESLint/syntax/diff通过。已提交worker另有sealed reader4/evolution consumers6通过，六个真实sealed pins/hash免费检查通过。原worker/mock paired接线smoke尚未成功完成，最终尝试被用户中断；真实语义、promotion/review/消费/回滚仍待验证。没有full suite/build/CI/UI/Android检查。

累计1124 requests /6422466 accounted tokens；818reported、54unknown、252carry，unknown原上界829478。pending0/lock0，本任务进程已停止。保留旧 breached/错误/原无效响应与全部费账；API唯一硬限见 [Governance §13.1](README.md#131-api-测试执行规则)。

## 恢复后的下一行动

1. 先离线 verify-only/full restore，核对实际HEAD与六个未提交文件恢复；依源码/tests各自锁文件恢复依赖。
2. 审阅未完成promotion/resume实现，完成原worker免费mock接线验证；该检查不等于真实双模型验收。
3. 核对本地连接配置和服务是否已恢复，保留530/524历史；现有scope仅pin旧d1，不直接重跑。完成实现/最小验证并提交后重新冻结当前HEAD/evaluator/runner，显式指定原两域/原F2来源、独立sealed目录及失败校准resumeRun，通过exact已付费校验复用两控制。
4. 每个修复试验版本各提炼一个新候选并冻结，沿原开发门槛→九对独立验收→原私有审阅发布→下一消费→守卫回滚推进。两域完整验收前不集成main，不进入S11/G；不改分、不清账、不伪造用户反馈或生产授权。

接手提示词：解压新的 Atria-M1-paused-private-20261009.zip，执行本包离线恢复，然后核对Git并读 workspaces/Atria-docs/HANDOFF.md → 指定Plan模块 → 同一Record最新“用户明确暂停并再次换设备”节，继续M1。F2双模型来源前置已完成；第一次F3候选都未过开发门槛，新协议校准被530/524中断，M1未完成。产品本地HEAD4fc2871f，六个未提交文件必须恢复。先完成原worker的免费接线检查和未完成promotion/resume代码，再核对连接恢复、提交并冻结新scope，以exact消息/配置/持久费用复用已通过控制。沿原双模型/全部critical维度/独立来源隔离及发布消费回滚门槛持续完成M1；不把单轮失败或阶段结束当停工点，只作最小相关本地验证。
