# 限制与 Agent 入口清理

- Primary Workspace: `docs`
- 范围：344 份已跟踪文档的限制/停工措辞扫描；全局及项目各层级 Agent 入口；私有恢复说明；

## 发现与处理

| 原有要求 | 来源 | 处理 |
| --- | --- | --- |
| 累计 1000、每批 60/72、Step 12/18/24、主次连接分别配额 || 当前入口取消；历史数字仅作事实 |
| token 总额、输出额度、未知费用/旧 breach 阻止测试 || 统计与测试限额分开；生产预算不作为测试许可 |
| 单轮、单候选、来源不足或首失败后停工 | M1 feedback、游戏 staging | 失败保存，继续诊断、修复与必要复测 |
| 每阶段停止、阶段交接、等用户报告 CI 完成 | 游戏 staging、Native Session implementation、旧前端方案 | 删除执行要求，按依赖继续 |
| 全量 API/E2E、required CI、PR 前置、完整设备矩阵 ||未测范围如实记录|
| 带日期的“最新用户指令”作为规则正文 || 删除对话背书，直接写规则 |

权威规则见 [Governance §12 / §13.1](../../README.md#131-api-测试执行规则)。产品行为、数据保护和生产自动发布权限保留在对应产品契约中；实际失败、不利评分和历史费用没有改成通过。

## Agent 文件

| --- | --- |
| 项目 main / Runtime source / frontend routing source | 各从 56 / 56 / 61 行精简为 12 / 12 / 13 行；保留产品边界和文档路由，删除重复治理及 Skill 额外许可 |
| docs | 从 26 行精简为 7 行 |
| package / plugin | 从 17 / 15 行精简为各 7 行 |
| evidence-source |不作为当前执行入口|
| 项目父目录及子目录 | 没有额外 `AGENTS.md` / `agent.md`；|

安装缓存中的第三方插件模板不属于这些工作区的 Agent 指令继承层级。没有新增 Agent 文件或全局规则。

## 远端入口同步

同步范围为 main、docs、package、plugin、feat/agent-intelligence-runtime、feat/atria-project-skill-routing、feat/agent-intelligence-plan。package / plugin 先快进到已存在的远端更新，再保存清理后的入口；未覆盖其它提交或恢复已删除的分支。

匹配的阶段停工与 CI 条款同步清理，设计模块保留。main 与两个产品任务的 Claude 入口只读取 AGENTS 和正式 docs 治理。

| 分支 | 入口清理提交 |
| --- | --- |
| `main` | `11416ef0daf1` |
| `package` | `4a268b51842d` |
| `plugin` | `ee99b2b3d1c6` |
| `feat/agent-intelligence-runtime` | `9741172044b4` |
| `feat/atria-project-skill-routing` | `51bde63fe8b7` |
| `feat/agent-intelligence-plan` | `8fb5ad0e14be` |

五个源码/资产工作树只提交 Agent / Claude 入口。产品实现、私有恢复包与密封材料没有加入这些提交。
