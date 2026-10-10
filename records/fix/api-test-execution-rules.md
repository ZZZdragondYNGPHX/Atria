# 验证限制与 Agent 入口清理

- Primary Workspace: `docs`
- 范围：344 份已跟踪文档的限制/停工措辞扫描；全局及项目各层级 Agent 入口；私有恢复说明；相关测试消费者的静态核对。

## 发现与处理

| 原有要求 | 来源 | 处理 |
| --- | --- | --- |
| 累计 1000、每批 60/72、Step 12/18/24、主次连接分别配额 | Governance、M1 acceptance、历史 Record | 当前入口取消；历史数字仅作事实 |
| token 总额、输出额度、未知费用/旧 breach 阻止测试 | M1 acceptance、S06、生产模式说明 | 统计与测试限额分开；生产预算不作为测试许可 |
| 逐轮 scope/claim、次数许可、作者许可、每轮完整账目/hash 审批 | M1 feedback、HANDOFF、私有恢复说明 | 取消审批；版本与账目只记录实际结果 |
| 第二模型准入、固定八项控制、三/九对、两/六胜、先得到两条 gap | M1 acceptance、feedback、HANDOFF | 工程验证按具体问题选择最小相关集合 |
| 单轮、单候选、来源不足或首失败后停工 | M1 feedback、游戏 staging | 失败保存，继续诊断、修复与必要复测 |
| 每阶段停止、阶段交接、等用户报告 CI 完成 | 游戏 staging、Native Session implementation、旧前端方案 | 删除执行要求，按依赖继续 |
| 全量 API/E2E、required CI、PR 前置、完整设备矩阵 | platform modernization、Frontend v3、Native Session、immersive validation | 改为最小相关本地验证；未测范围如实记录 |
| 带日期的“最新用户指令”作为规则正文 | open-roleplay index / staging / verification | 删除对话背书，直接写规则 |

权威规则见 [Governance §12 / §13.1](../../README.md#131-api-测试执行规则)。产品行为、数据保护和生产自动发布权限保留在对应产品契约中；实际失败、不利评分和历史费用没有改成通过。

## Agent 文件

| 层级 | 检查结果 |
| --- | --- |
| 全局 `~/.codex/AGENTS.md` | 只有最小相关本地验证一句，保留原文 |
| 项目 main / Runtime source / frontend routing source | 各从 56 / 56 / 61 行精简为 12 / 12 / 13 行；保留产品边界和文档路由，删除重复治理及 Skill 额外许可 |
| docs | 从 26 行精简为 7 行 |
| package / plugin | 从 17 / 15 行精简为各 7 行 |
| evidence-source | 冻结历史证据工作树，检查后保留原字节；不作为当前执行入口 |
| 项目父目录及子目录 | 没有额外 `AGENTS.md` / `agent.md`；忽略目录和隐藏目录也已检查 |

安装缓存中的第三方插件模板不属于这些工作区的 Agent 指令继承层级。没有新增 Agent 文件或全局规则。

## 测试实现静态发现

前次静态检查时源码工作树有未提交产品修改；检查没有覆盖产品代码或运行模型测试。以下实现发现是当时观察，最新实现以真实 Git 为准，不构成新的执行要求。

- `tests/agent-intelligence/m1-live.mjs` 已使用 `M1ApiQuota` 和 advisory budget；`m1-quota.js` 的实际调用硬限为 2000 / 20，旧 token 和 owner 数字不能再当成新的 API 限额。
- 仍能看到 runner 总计两小时 abort、`m1-retry.js` 每次请求三次 attempt、F3 固定控制/三对及旧恢复九对结构。它们是实现中的常数；此次文档清理不等于已修改或验证这些消费者。遇到相关问题按当前规则直接修复，无需用户解除自设限制。
- 生产 report / journal / publication 容量和绑定检查属于产品消费契约，超容量问题沿相关测试消费者解决，不转成 API 测试许可。

私有 ZIP、密封正文、恢复清单和历史报告保持原字节；可变私有 README 已清理旧双模型与配额表述，恢复时以当前 docs 规则为准。

## 本地验证

只检查改动文档的链接/锚点、Markdown 围栏、剩余限制措辞及各工作树差异空白；没有执行产品全量测试、构建、远端 CI、真实模型或设备验证。

## 远端入口同步

同步范围为 main、docs、package、plugin、feat/agent-intelligence-runtime、feat/atria-project-skill-routing、feat/agent-intelligence-plan。package / plugin 先快进到已存在的远端更新，再保存清理后的入口；未覆盖其它提交或恢复已删除的分支。

企划分支移除第二份完整治理及旧 M1 验收规则，README / Agent / Claude / HANDOFF 统一路由到正式 docs。匹配的阶段停工与 CI 条款同步清理，设计模块保留。main 与两个产品任务的 Claude 入口只读取 AGENTS 和正式 docs 治理。

| 分支 | 入口清理提交 |
| --- | --- |
| `main` | `11416ef0daf1` |
| `package` | `4a268b51842d` |
| `plugin` | `ee99b2b3d1c6` |
| `feat/agent-intelligence-runtime` | `9741172044b4` |
| `feat/atria-project-skill-routing` | `51bde63fe8b7` |
| `feat/agent-intelligence-plan` | `8fb5ad0e14be` |

本地检查仅包括改动文档的围栏、链接/锚点、限制措辞与 Git 差异。正式 docs 与企划副本的新增/修改链接分别核对 13 / 8 项；五个源码/资产工作树只提交 Agent / Claude 入口。产品实现、私有恢复包与密封材料没有加入这些提交。
